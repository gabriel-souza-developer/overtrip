# Referências de design — plataforma multinicho

Este documento orienta o desenvolvimento da branch multinicho. A interface deve ser simples para quem opera o negócio todos os dias: prioridade para tarefas, leitura rápida, estados claros, navegação previsível e uso em celular.

## Fontes preferenciais

Consulte estas fontes ao buscar soluções visuais ou componentes, escolhendo apenas o que atende ao fluxo:

1. [v0](https://v0.app/) — explorar composição, hierarquia e protótipos; código gerado exige revisão antes de uso.
2. [ObsidianUI](https://temp.obsidianui.dev/) — explorar componentes e efeitos. O endereço não ficou acessível na consulta de 15/11/2026; verificar a fonte antes de usar.
3. [Libraries.dev](https://libraries.dev/) — avaliar efeitos isolados quando melhorarem uma interação.
4. [Bencho](https://bencho.dev/) — referência de microinterações; confirmar acesso ao código e licença antes de incorporar.
5. [beUI](https://beui.dev/) — consultar componentes e blocos; a página identifica componentes gratuitos como MIT e também oferece produtos Pro com condições próprias.

Flowbite e daisyUI são alternativas finais quando as fontes acima não atenderem à necessidade. Componentes já existentes no projeto podem ser reaproveitados quando adequados. Não instalar uma biblioteca inteira para obter um efeito simples.

## Aplicação ao multinicho

- Acesso comum e identidade da plataforma; empresa, cores e módulos definidos pelo contexto autorizado no servidor.
- Pousadas priorizam chegadas, saídas e disponibilidade; restaurantes, reservas e mesas. O painel de turismo da OVERTRIP continua em sua própria linha de desenvolvimento.
- Cada tela deve apresentar uma ação principal clara, estados vazios úteis e linguagem do negócio. Usar componentes comuns com conteúdo e regras específicos por nicho.
- Layout adaptável a celular e computador, com navegação por teclado, foco visível, rótulos, contraste adequado e alvos de toque confortáveis.
- Animações devem ser discretas, opcionais e respeitar `prefers-reduced-motion`. Evitar efeitos contínuos, WebGL e downloads pesados sem benefício claro.
- A stack atual usa React 18 e Tailwind 3; exemplos que exigem outras versões precisam de avaliação de compatibilidade e dependências antes de adoção.

## Registro de componentes externos

Antes de incorporar código, conferir termos e licença da versão exata, inclusive exigências de atribuição e uso comercial; não presumir que ofertas gratuitas e Pro tenham os mesmos termos. Avaliar acessibilidade, segurança, desempenho, dependências, manutenção e comportamento sem movimento. Registrar abaixo a origem, versão ou data, licença, atribuição necessária e arquivos adaptados. Não enviar dados reais de clientes a ferramentas de prototipação sem autorização e análise de privacidade.

| Componente | Origem e versão/data | Licença e atribuição | Arquivos adaptados |
| --- | --- | --- | --- |
| Nenhum incorporado até agora | — | — | — |
