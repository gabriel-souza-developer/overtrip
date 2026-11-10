# Colocar o OVERTRIP no ar (máquina Oracle)

> **Atenção: roteiro histórico.** A Oracle já está publicada e difere das
> instruções abaixo. Consulte primeiro [ORACLE_STATUS.md](ORACLE_STATUS.md).
> Não execute os comandos de firewall, publicação, atualização ou restauração
> deste roteiro na VM atual sem revisão: o Caddy usa bind específico para
> preservar o Tailscale, os arquivos públicos ficam em `/srv/overtrip-public`
> e `/srv/overtrip/app` foi instalado por `git archive` e não possui Git.
> Não use `netfilter-persistent save` para capturar regras dinâmicas do Tailscale.
> A restauração SQLite abaixo também precisa de procedimento revisado e backup
> consistente antes de sua execução.

Tudo na mesma máquina e no mesmo domínio: site em `overtrip.com.br/`, painel em `/admin`, API em `/api`. O banco (SQLite) fica **fora** do repositório, com backup diário.
Nada aqui foi publicado ainda. Cada passo abaixo é feito por você, na ordem.

**Migração histórica:** `0_init` teve texto de aviso do Prisma removido do fim
do SQL. Isso muda seu checksum. Em bancos que já registraram essa migração,
faça backup e verifique o histórico antes de usar comandos de desenvolvimento;
não execute reset nem modifique `_prisma_migrations` automaticamente. Em banco
novo, `prisma migrate deploy` aplica a cadeia completa normalmente.

## 1. Criar a máquina
Na Oracle Cloud, crie uma instância Ubuntu (pode ser ARM, "Ampere"). Guarde o IP público e entre por SSH com a chave que a Oracle gerar.

## 2. Liberar as portas 80 e 443
- No painel da Oracle: Rede > sua VCN > **Security List** > adicione regras de entrada (TCP) para as portas **80** e **443**, origem `0.0.0.0/0`.
- Na máquina (o Ubuntu da Oracle bloqueia por padrão):
  ```
  sudo iptables -I INPUT 6 -p tcp --dport 80 -j ACCEPT
  sudo iptables -I INPUT 6 -p tcp --dport 443 -j ACCEPT
  sudo netfilter-persistent save
  ```
  (se `netfilter-persistent` não existir: `sudo apt install iptables-persistent`)

## 3. Instalar Node, Caddy e sqlite3
```
sudo apt update && sudo apt install -y sqlite3 git curl
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

## 4. Publicar o código
```
sudo useradd --system --home /srv/overtrip --shell /usr/sbin/nologin overtrip
sudo mkdir -p /srv/overtrip /var/lib/overtrip /var/backups/overtrip /etc/overtrip
# copie o código para /srv/overtrip/app (git clone do seu repositório, ou rsync)
cd /srv/overtrip/app
npm ci
npx prisma generate
npm run build            # API  -> dist/
npm run build:frontend   # painel -> dist/frontend/ (já preparado para /admin)
```

## 5. Configurar o ambiente
```
sudo cp deploy/env.production.example /etc/overtrip/env
sudo nano /etc/overtrip/env
sudo chmod 600 /etc/overtrip/env
```
Preencha: `JWT_SECRET` (mínimo 32 caracteres aleatórios, ex.: `openssl rand -hex 32`), `DATABASE_URL=file:/var/lib/overtrip/overtrip.db`, `CORS_ORIGIN=https://overtrip.com.br`, e se quiser a ajuda de IA `GEMINI_API_KEY` e `AI_MODEL`.
O limite de tentativas de login usa o IP real automaticamente (a API confia em 1 proxy, o Caddy). Para desligar: `TRUST_PROXY=0`.

## 6. Banco de dados
O projeto tem a migração `0_init`; o comando certo é **`prisma migrate deploy`** (não `db push`).
- **Banco novo:** `DATABASE_URL=file:/var/lib/overtrip/overtrip.db npx prisma migrate deploy`
- **Copiar banco existente:** faça backup e confira seu histórico e schema antes de executar migrações. Bancos criados com `db push` podem já conter colunas de várias migrações; não marque `0_init` nem outras como aplicadas sem comparar o schema e planejar o baseline.
- Depois: `sudo chown -R overtrip:overtrip /var/lib/overtrip /var/backups/overtrip`

## 7. Criar o administrador
(Só se o banco for novo; um banco copiado já tem o admin.)
```
ADMIN_PASSWORD="uma-senha-forte" DATABASE_URL=file:/var/lib/overtrip/overtrip.db npx tsx prisma/seed.ts
```
O login é `admin@overtrip.com.br`.

## 8. Ligar os serviços
```
sudo cp deploy/overtrip-api.service deploy/overtrip-backup.service deploy/overtrip-backup.timer /etc/systemd/system/
sudo chmod +x deploy/backup-sqlite.sh
sudo systemctl daemon-reload
sudo systemctl enable --now overtrip-api overtrip-backup.timer
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
```
O código precisa ser legível pelo usuário `overtrip` (API) e pelo `caddy` (site e painel):
```
sudo chown -R overtrip:caddy /srv/overtrip/app
sudo chmod -R o-rwx /srv/overtrip/app
sudo chmod g+x /srv/overtrip/app
sudo chmod -R g+rX /srv/overtrip/app/index.html /srv/overtrip/app/css /srv/overtrip/app/js /srv/overtrip/app/assets /srv/overtrip/app/blog /srv/overtrip/app/riders /srv/overtrip/app/dist/frontend
sudo -u caddy test -r /srv/overtrip/app/index.html && echo "caddy lê o código"
```
Garanta acesso de leitura do grupo também aos demais arquivos públicos listados
no Caddyfile. Mantenha `.env`, exports de workflows e outros arquivos privados
fora da pasta publicada e sem permissão de leitura para o grupo `caddy`.
Se o código não estiver em `/srv/overtrip/app`, ajuste os caminhos no `Caddyfile` e nos `.service`.

Verificação de saúde a cada 5 minutos (serviços, disco, memória, backup recente, HTTPS e certificados).
Roda como `overtrip`, sem root, e não lê banco nem credenciais:
```
sudo install -m 755 -o root -g root deploy/monitor-health.sh /usr/local/libexec/overtrip-health.sh
sudo install -d -o overtrip -g overtrip -m 750 /var/lib/overtrip/health   # status.json lido pelo painel
sudo cp deploy/overtrip-health.service deploy/overtrip-health.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo -u overtrip ls /var/backups/overtrip >/dev/null && echo "overtrip lê os backups"
sudo systemctl enable --now overtrip-health.timer
sudo systemctl start overtrip-health.service; journalctl -u overtrip-health.service -n 20
```
Falhas aparecem como `ALERTA:` no journal e deixam o serviço em estado `failed`
(`systemctl --failed`). O último resultado aparece no painel em **Servidor** (só administradores),
lido de `/var/lib/overtrip/health/status.json` (`HEALTH_STATUS_FILE` muda o caminho). Ainda não há envio de alerta para fora da máquina.

## 9. DNS
1. **Um ou dois dias antes**, baixe o TTL dos registros do domínio para 300 segundos (5 min), no provedor atual.
2. Na hora de virar: aponte `overtrip.com.br` e `www` (registro A) para o IP da máquina Oracle.
3. O Caddy emite o certificado HTTPS sozinho assim que o DNS chegar (precisa das portas 80/443 abertas).

## 10. Conferir
```
curl -I https://overtrip.com.br/            # 200
curl https://overtrip.com.br/api/public/trips
curl -I https://overtrip.com.br/admin/      # 200
curl -I https://overtrip.com.br/.git/config # 404 (o repositório não é exposto)
systemctl status overtrip-api
sudo systemctl start overtrip-backup.service && ls /var/backups/overtrip
```
Abra o site, entre em `/admin`, faça login e salve uma viagem.

## 11. Voltar atrás
Enquanto o TTL estiver baixo, basta apontar o DNS de volta para a hospedagem antiga (HostGator); em poucos minutos tudo volta. Não apague a hospedagem antiga até ter certeza de que a nova está estável.

## Atualizar depois
```
sudo systemctl start overtrip-backup.service      # backup antes de mexer no banco
cd /srv/overtrip/app && git pull && npm ci && npm run build && npm run build:frontend
set -a; . /etc/overtrip/env; set +a               # carrega DATABASE_URL do banco de produção
npx prisma migrate deploy
sudo systemctl restart overtrip-api
```

## Restaurar um backup
```
sudo systemctl stop overtrip-api
# Pare também qualquer worker que use o banco antes de prosseguir.
sudo -u overtrip sh -c 'umask 077; gunzip -c /var/backups/overtrip/overtrip-AAAAMMDD-HHMMSS.db.gz > /var/lib/overtrip/restauracao.tmp.db'
sudo -u overtrip sqlite3 /var/lib/overtrip/restauracao.tmp.db 'PRAGMA integrity_check;'
# Prossiga somente se o resultado for exatamente "ok".
sudo cp /var/lib/overtrip/overtrip.db /var/lib/overtrip/overtrip.db.antes-restauracao
sudo rm -f /var/lib/overtrip/overtrip.db-wal /var/lib/overtrip/overtrip.db-shm
sudo mv /var/lib/overtrip/restauracao.tmp.db /var/lib/overtrip/overtrip.db
sudo systemctl start overtrip-api
```
