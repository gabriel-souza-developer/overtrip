-- Token de redefinição de senha ("esqueci minha senha"): aditivo, não afeta
-- dados existentes. Guarda só o hash do token (nunca o valor bruto enviado
-- por e-mail); expiração curta e usedAt para uso único.
--
-- issuedForUpdatedAt grava o User.updatedAt (versão de credencial) no
-- instante em que o token é emitido, lido e gravado na mesma transação da
-- leitura do usuário. Ao consumir o token (resetPassword), comparamos esse
-- valor com o User.updatedAt ATUAL: se a senha mudou por qualquer caminho
-- (outra redefinição ou troca autenticada) entre a emissão e o consumo, a
-- versão não combina mais e o token é rejeitado — mesmo numa corrida onde a
-- emissão leu o usuário antes dessa mudança mas só gravou o token depois
-- (quando a varredura de invalidação já tinha rodado e não viu este token
-- ainda inexistente). Esta tabela nunca foi publicada, então a coluna entra
-- já como NOT NULL na criação, sem precisar de valor padrão para linhas
-- existentes.
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "issuedForUpdatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");
