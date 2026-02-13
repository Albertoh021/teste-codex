# Dashboard de Análise de Custos (Entregas + Coletas)

Aplicação web completa para análise financeira de uma empresa de entregas e coletas, com cálculos no estilo Excel e atualização automática a partir do Google Sheets.

## Funcionalidades

- Integração com **Google Sheets API**.
- Atualização automática dos dados em cache (intervalo configurável).
- Filtros por:
  - Período (**dia**, **quinzena**, **mês**)
  - Entregador
- Dashboard com:
  - Cards de resumo financeiro
  - Tabela detalhada
  - Gráfico de receita, custos e lucro
- Regras de negócio implementadas:
  - `Lucro = Total recebido - (pagamentos + custos operacionais)`
  - Quinzena:
    - Q1: dias 1 a 15
    - Q2: dia 16 até final do mês
- Exportação de relatório em:
  - **Excel (.xlsx)** via endpoint
  - **PDF** via impressão do navegador
- Tema claro/escuro.
- Responsivo para desktop e mobile.
- Autenticação básica opcional para endpoints `/api`.
- Upload direto de planilha Excel no navegador (abas `ENTREGAS` e `COLETAS`) para gerar dashboard local sem backend.

## Estrutura do projeto

```txt
.
├── public/
│   ├── app.js
│   ├── index.html
│   └── styles.css
├── src/
│   ├── services/
│   │   └── sheetsService.js
│   ├── utils/
│   │   └── calculations.js
│   └── server.js
├── .env.example
├── package.json
└── README.md
```

## Pré-requisitos

- Node.js 18+
- Conta Google Cloud com Sheets API habilitada
- Planilha Google com abas:
  - `ENTREGAS` (`A:E`)
  - `COLETAS` (`A:D`)

## Configuração da Google Sheets API (passo a passo)

1. Crie um projeto no [Google Cloud Console](https://console.cloud.google.com/).
2. Habilite a API **Google Sheets API**.
3. Vá em **IAM e administrador > Contas de serviço**.
4. Crie uma conta de serviço e gere uma chave JSON.
5. Compartilhe sua planilha com o e-mail da conta de serviço (permissão de leitura).
6. Copie o ID da planilha pela URL:
   - `https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/edit`
7. Configure o `.env`:

```bash
cp .env.example .env
```

8. Escolha uma forma de credencial:

### Opção A (arquivo JSON)

- Salve o JSON em `./credentials/service-account.json`
- Defina:

```env
GOOGLE_APPLICATION_CREDENTIALS=./credentials/service-account.json
```

### Opção B (JSON inline)

- Copie todo o conteúdo JSON para:

```env
GOOGLE_SERVICE_ACCOUNT_JSON={...json...}
```

9. Configure também:

```env
PORT=3000
GOOGLE_SHEETS_SPREADSHEET_ID=seu_id
GOOGLE_SHEETS_DELIVERIES_RANGE=ENTREGAS!A:E
GOOGLE_SHEETS_PICKUPS_RANGE=COLETAS!A:D
REFRESH_INTERVAL_MS=60000
```

## Como rodar

### Modo completo (Google Sheets + backend Node/Express)

```bash
npm install
npm run dev
```

Acesse: `http://localhost:3000`

### Modo demo (sem instalar dependências)

Se você só quer ver o front funcionando imediatamente:

```bash
node demo-server.js
```

O modo demo sobe um servidor HTTP simples com dados de exemplo e endpoints `/api/*` simulados.


### Upload de planilha direto no site

1. Rode o sistema (modo demo ou completo).
2. Na tela, em **Importar planilha**, selecione um arquivo `.xlsx`/`.xls`.
3. O arquivo deve ter abas:
   - `ENTREGAS` com colunas: Data, Entregador, Quantidade, Valor recebido, Valor pago
   - `COLETAS` com colunas: Data, Tipo, Valor recebido, Custo operacional
4. O dashboard passa a operar em **modo arquivo local** (filtros, cards e gráficos).
5. Clique em **Voltar para API** para retornar ao modo Google Sheets/backend.

## Endpoints principais

- `GET /api/health`
- `GET /api/dashboard?granularity=month&period=2025-05&courier=Joao`
- `POST /api/refresh`
- `GET /api/export/excel?granularity=fortnight&period=2025-05-Q1`

## Observações importantes

- O parser de datas aceita múltiplos formatos (ISO, `dd/mm/yyyy`, serial de planilha).
- O front atualiza automaticamente a cada 60 segundos.
- Caso `BASIC_AUTH_USER` e `BASIC_AUTH_PASS` sejam definidos, os endpoints `/api` exigirão autenticação Basic Auth.
