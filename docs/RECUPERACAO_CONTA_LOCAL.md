# Recuperação administrativa local de conta

Este procedimento é uma ferramenta local da branch de trabalho. Ele não foi executado nem validado em produção. Antes de usá-lo em qualquer instalação, confirme a identidade do solicitante por canal independente e teste a recuperação com uma cópia consistente do banco e um backup recuperável.

O operador informa explicitamente o arquivo SQLite existente e o ID exato da conta. A execução sem `--apply` apenas verifica se a conta existe e não altera a senha:

```text
npx tsx scripts/recover-account-password.ts --database file:/caminho/absoluto/banco.db --user-id ID
```

Para aplicar, acrescente `--apply` e forneça a senha nova por stdin de uma fonte segura sem eco; não coloque senha em argumento, variável de ambiente, histórico do shell ou arquivo persistente. A senha deve ter pelo menos oito caracteres, até 72 bytes UTF-8 e não pode conter NUL ou quebra de linha. O comando exige entrada redirecionada, não lê uma senha digitada diretamente em terminal com eco.

Uma redefinição aplicada altera somente o hash da senha e a versão da sessão. Todos os tokens e cookies anteriores dessa conta deixam de funcionar; nomes, permissões e vínculos com empresas não são alterados. A operação não cria contas. Se a execução terminar com erro inesperado, confirme o estado do banco antes de tentar novamente: uma falha de saída pode ocorrer depois da gravação.

Esse procedimento exige acesso administrativo ao arquivo do banco e não substitui recuperação por canal verificado nem gestão de usuários pela agência.
