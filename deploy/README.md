# Colocar o OVERTRIP no ar (máquina Oracle)

Tudo na mesma máquina e no mesmo domínio: site em `overtrip.com.br/`, painel em `/admin`, API em `/api`. O banco (SQLite) fica **fora** do repositório, com backup diário.
Nada aqui foi publicado ainda. Cada passo abaixo é feito por você, na ordem.

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
- **Copiar o banco atual** (do seu computador, `prisma/dev.db`): envie com `scp` para `/var/lib/overtrip/overtrip.db`. Se o banco foi criado com `db push`, o `migrate deploy` reclama que ele "não está vazio" (erro P3005); nesse caso rode uma vez `npx prisma migrate resolve --applied 0_init` (com a mesma `DATABASE_URL`) e depois `migrate deploy`.
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
sudo chmod -R o+rX /srv/overtrip/app    # ou: sudo chown -R overtrip:caddy /srv/overtrip/app && sudo chmod -R g+rX,o-rwx /srv/overtrip/app
sudo -u caddy test -r /srv/overtrip/app/index.html && echo "caddy lê o código"
```
Se o código não estiver em `/srv/overtrip/app`, ajuste os caminhos no `Caddyfile` e nos `.service`.

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
sudo cp /var/lib/overtrip/overtrip.db /var/lib/overtrip/overtrip.db.antes-restauracao   # guarda o banco atual
sudo rm -f /var/lib/overtrip/overtrip.db-wal /var/lib/overtrip/overtrip.db-shm
gunzip -c /var/backups/overtrip/overtrip-AAAAMMDD-HHMMSS.db.gz | sudo -u overtrip tee /var/lib/overtrip/overtrip.db >/dev/null
sudo systemctl start overtrip-api
```
