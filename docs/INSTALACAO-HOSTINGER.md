# Agent Village na Hostinger: instalação e uso

Este guia instala, na sua VPS da Hostinger:

- **Hermes Agent:** um perfil por agente (Matt, Iris, Cole, Penny, Reed, Tess, Ezra e Kai), cada um com personalidade, memória, skills e cinto de ferramentas próprios.
- **Agent Village:** a vila estilo Atari, aberta pela web em `https://vila.SEUDOMINIO.com`, protegida por usuário e senha.

```
Você (celular/PC) → https://vila.SEUDOMINIO.com → usuário e senha (Caddy)
   → vila  (só dentro da VPS, 127.0.0.1:8765)
   → Hermes (só dentro da VPS, 127.0.0.1:8642)
```

O Hermes **não** fica exposto na internet. Só a vila fica pública, protegida por senha.

> Em todo o guia, troque `SEUDOMINIO.com` pelo seu domínio e `IP-DA-VPS` pelo IP da sua VPS.

---

## Antes de começar

Você precisa de:

- [ ] Uma VPS Ubuntu na Hostinger, com o **Hermes Agent já instalado e funcionando**
- [ ] Um domínio gerenciado no hPanel
- [ ] O arquivo **`hermes-village.tar.gz`** baixado no seu computador

**Nunca** cole senha ou chave de API em chat, print ou e-mail.

---

## Parte 1 — Preparar a VPS

### 1. Abrir o terminal da VPS

No hPanel: **VPS → seu servidor → Terminal do navegador**.
Ou, pelo seu computador:

```bash
ssh root@IP-DA-VPS
```

### 2. Conferir onde o Hermes roda

```bash
command -v hermes && hermes --version
```

- **Apareceu um caminho e a versão:** siga para o passo 3.
- **Deu "not found":** rode `docker ps`. Se aparecer um container do Hermes, **pare aqui**: no Docker a instalação muda e o pacote precisa ser ajustado.

### 3. Enviar o pacote para a VPS

**Pelo hPanel:** abra o **Gerenciador de arquivos** da VPS e faça upload do `hermes-village.tar.gz` para a pasta do usuário que roda o Hermes (normalmente `/root`).

**Ou pelo seu computador:**

```bash
scp hermes-village.tar.gz root@IP-DA-VPS:~
```

---

## Parte 2 — Instalar os agentes no Hermes

### 4. Extrair e instalar

```bash
cd ~
tar xzf hermes-village.tar.gz
cd hermes-village
bash install.sh
```

O script:

- cria um perfil Hermes por agente, copiando o modelo e as credenciais que o seu Hermes já usa;
- liga a API do Hermes **só dentro da VPS**, com o roteamento de um perfil por agente;
- gera uma **chave de API** e mostra uma única vez.

> **Se aparecer um aviso sobre `aiohttp`:** rode o comando que a mensagem mostrar (algo como `... -m pip install aiohttp`) e repita `bash install.sh`.

A chave fica salva na VPS. Para vê-la de novo:

```bash
grep API_SERVER_KEY ~/.hermes/.env
```

### 5. Reiniciar o Hermes

```bash
hermes gateway restart
```

- **Se você rodava o Hermes em primeiro plano** (num terminal ou `tmux`): pare-o e rode `hermes gateway run`.
- **Para deixar como serviço permanente:** `hermes gateway install` e depois `hermes gateway start`.

### 6. Testar o Hermes

```bash
curl -s localhost:8642/health
```

O resultado esperado é `{"status": "ok", ...}`.

---

## Parte 3 — Publicar a vila com senha

### 7. Criar o subdomínio

No hPanel: **Domínios → seu domínio → DNS**. Adicione um registro:

| Tipo | Nome | Aponta para |
|---|---|---|
| A | `vila` | IP da VPS |

A propagação pode levar de alguns minutos a uma hora.

### 8. Conferir as portas 80 e 443

```bash
sudo ss -tlnp | grep -E ':80 |:443 '
```

- **Não apareceu nada:** siga para o passo 9.
- **Apareceu nginx, Apache ou Traefik:** as portas estão ocupadas, e a configuração precisa ser adaptada para esse programa em vez do Caddy.

### 9. Instalar o Caddy (cuida do HTTPS e da senha)

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

Logo depois de instalar, esvazie a configuração padrão. O comando guarda um backup:

```bash
sudo cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak && echo -n | sudo tee /etc/caddy/Caddyfile
```

### 10. Liberar só a web no firewall

```bash
sudo ufw allow 80 && sudo ufw allow 443
```

Se você usa o firewall do hPanel, libere as portas **80** e **443** lá também.
**Nunca** libere as portas 8642 ou 8765.

### 11. Instalar a vila

```bash
cd ~/hermes-village
bash village_install.sh vila.SEUDOMINIO.com
```

O script pede:

```
Village username:                    ← o usuário que você quiser (ex.: edward)
Village password (12+ characters):   ← a senha (não aparece enquanto você digita)
```

- **Você escolhe o usuário e a senha.** Não existe senha padrão.
- **A senha fica só na VPS.** O Caddy guarda apenas uma versão cifrada (hash bcrypt).
- **A vila vira um serviço** que liga sozinho quando a VPS reinicia.

### 12. Abrir a vila

Abra **`https://vila.SEUDOMINIO.com`** no celular ou no computador e entre com o usuário e a senha.
O selo **HERMES SERVER** aparece no topo.

---

## Como usar a vila

### Controles

| Ação | Teclado | Celular |
|---|---|---|
| Andar | Setas ou WASD | Botões de direção |
| Correr | Segurar Shift | Botão **RUN** |
| Falar com quem está perto | `T` | Botão **TALK** |
| Chamar o Chief of Staff (Matt) | `M` duas vezes | Botão **CHIEF** |
| Entrar numa casa | Andar para dentro da porta | Andar para dentro da porta |
| Mapa de caminhos | `G` | — |
| Fechar painéis | `Esc` | Botão `×` |

### Os agentes

| Agente | Casa | Cuida de |
|---|---|---|
| Matt | Town Hall | Chief of Staff: recebe suas tarefas e distribui |
| Iris | Inbox House | E-mail e agenda (só rascunhos, nunca envia) |
| Cole | Content Studio | Vídeos, roteiros e redes sociais (nunca publica) |
| Penny | Money House | Finanças: orçamento, caixa, tesouraria, covenants |
| Reed | Research Library | Pesquisa e relatórios |
| Tess | Travel Lodge | Viagens e roteiros (nunca reserva nem paga) |
| Ezra | Code Workshop | Código e GitHub (só leitura) |
| Kai | Knowledge Archive | Base de conhecimento |

### Dar uma tarefa

Digite na barra do topo e toque **SEND**.
O Matt escolhe o agente certo, o agente faz a tarefa e o resultado vai para **REVIEW**.

### Reunião

Escolha a pauta e toque **MEETING**: todos os diretores vão para a mesa do Town Hall.

### Contratar estagiários

Toque **HIRE**, escolha o diretor e depois **Find candidates**, e toque **Approve hire** e **Confirm**.
O estagiário aparece de colete amarelo.

### Cinto de ferramentas e decisões

Ao falar com um agente, aparece o **TOOL BELT** dele. Nesse modo ele é só leitura, porque quem manda nas ferramentas é o servidor.
O botão **DECISIONS** mostra cada execução: data, sucesso ou erro, aprovações, número de chamadas e custo estimado.

### Aprovações

Quando um agente quer usar uma ferramenta arriscada, a tarefa **pausa**:

1. O agente mostra **"Needs your OK!"** e o botão **REVIEW** ganha um número.
2. Em **REVIEW** aparece exatamente o que ele quer fazer.
3. Você escolhe **ALLOW ONCE**, **ALLOW FOR THIS TASK** ou **DENY**.

"Sempre permitir" nunca é oferecido. Um pedido sem resposta é **negado depois de 10 minutos**.

### Review

Todo resultado passa por você antes de valer: **READ** para ler, **APPROVE** ou **REJECT** para decidir.

---

## Manutenção

| Para | Comando |
|---|---|
| Ver se a vila está rodando | `sudo systemctl status agent-village` |
| Ver erros da vila | `sudo journalctl -u agent-village -n 50` |
| Reiniciar a vila | `sudo systemctl restart agent-village` |
| Ver se o Hermes está ok | `curl -s localhost:8642/health` |
| Reiniciar o Hermes | `hermes gateway restart` |
| Ver a chave de API | `grep API_SERVER_KEY ~/.hermes/.env` |
| Ver as ferramentas de um agente | `~/.hermes/profiles/<agente>/config.yaml` → `platform_toolsets.api_server` |
| Mudar a personalidade de um agente | Editar `~/.hermes/profiles/<agente>/SOUL.md` e reiniciar o Hermes |

### Trocar a senha da vila

1. `sudo nano /etc/caddy/Caddyfile`
2. Apague o bloco `vila.SEUDOMINIO.com { ... }` inteiro e salve (`Ctrl+O`, Enter, `Ctrl+X`).
3. Rode de novo:

```bash
cd ~/hermes-village && bash village_install.sh vila.SEUDOMINIO.com
```

### Atualizar a vila com um pacote novo

Envie o novo `hermes-village.tar.gz` e rode:

```bash
cd ~ && tar xzf hermes-village.tar.gz && cd hermes-village
bash install.sh
bash village_install.sh vila.SEUDOMINIO.com
hermes gateway restart
```

Quando a senha já existe, o script não pergunta de novo.

---

## Resolução de problemas

| Sintoma | O que fazer |
|---|---|
| `hermes: not found` | O Hermes está em Docker ou em outro usuário. Não siga sem ajustar o pacote. |
| Aviso de `aiohttp` no `install.sh` | Rode o comando que a mensagem mostra e repita `bash install.sh`. |
| `/health` não responde | O Hermes não reiniciou. Rode `hermes gateway run` e veja as últimas linhas. |
| `Install Caddy first` | Faça o passo 9 antes do passo 11. |
| `Run install.sh first` | Faça o passo 4 antes do passo 11. |
| A página não abre / erro de certificado | O DNS ainda não propagou (espere) ou as portas 80/443 estão fechadas (passo 10). |
| O navegador não pede senha | O bloco da vila não está no Caddyfile. Rode o passo 11 de novo. |
| A vila abre mas os agentes dão erro | Veja `sudo journalctl -u agent-village -n 50`. Se aparecer 401, o Hermes não está com a chave certa: rode o passo 4 e reinicie os dois. |
| "no profile 'finance'" | O `install.sh` não terminou. Repita o passo 4 e reinicie o Hermes. |
| Erro 401 do modelo (Anthropic) | A credencial do Claude no Hermes expirou ou é inválida. Ajuste em `~/.hermes/.env` e reinicie o Hermes. |

---

## Segurança — resumo

- O Hermes e a vila escutam **só dentro da VPS** (`127.0.0.1`). Só o Caddy fica público, com **HTTPS e senha**.
- A **chave de API** do Hermes fica em `~/.hermes/.env` e em `/opt/agent-village/village.env`, com permissão restrita.
- Os agentes **nunca** recebem terminal, execução de código, navegador, controle do computador, agendamentos ou delegação.
- Os e-mails só viram **rascunho**, e só com a sua aprovação. O GitHub é **somente leitura**.
- **Token da assinatura:** se o Hermes usa o token da sua assinatura do Claude, confira se os termos da Anthropic permitem esse uso num servidor. Uma chave de API da Anthropic no Hermes evita a dúvida.
