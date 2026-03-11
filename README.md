# Sistema de Análise de Custos Logísticos

Dashboard web (HTML + JavaScript) que carrega automaticamente dados CSV do Google Sheets em tempo real para análise de custos operacionais, entregas, coletas, contratos e veículos.

## Funcionalidades

- Carregamento automático de 4 planilhas CSV publicadas.
- KPIs principais: entregas, coletas, receita, custo, lucro líquido, custo médio por entrega, margem.
- Filtros por período: dia, semana, quinzena, mês e intervalo personalizado.
- Filtros avançados: entregador, veículo e contrato.
- Gráficos interativos:
  - Custo por mês
  - Entregas por mês
  - Lucro por contrato
  - Custos por tipo de veículo (combustível, aluguel, seguro, manutenção)
- Ranking de entregadores por eficiência e ranking de contratos mais lucrativos.
- Tabela detalhada de operações.
- Exportação de relatório em Excel e PDF.

## Como rodar o projeto (passo a passo)

### 1) Entrar na pasta do projeto

```bash
cd /workspace/teste-codex
```

### 2) Subir um servidor local

Como o projeto é estático, você só precisa de um servidor HTTP simples:

```bash
python3 -m http.server 4173
```

### 3) Abrir no navegador

Acesse:

```text
http://localhost:4173
```

### 4) Parar o servidor

No terminal onde o servidor está rodando, pressione `Ctrl + C`.

## Solução rápida de problemas

- Se abrir em branco, confirme se você iniciou o servidor na pasta correta.
- Se aparecer erro de carregamento de CSV, verifique conexão de internet e se as planilhas continuam públicas.
- Se a porta `4173` estiver ocupada, troque por outra (ex.: `5173`) e abra a mesma porta na URL.

## Fontes CSV utilizadas

As URLs estão definidas em `app.js` na constante `CSV_SOURCES`.
