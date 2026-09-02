# Conflux Sourcify

Conflux Sourcify is a Sourcify-compatible smart contract source code verification service. It supports contract verification and lookup on Conflux Core Space, Conflux eSpace, and configured EVM networks.

## Requirements

- Git
- Docker
- Docker Compose v2.x.x
- An accessible MySQL service

Run the following command to check the Docker Compose version:

```bash
docker compose version
```

The output should be `Docker Compose version v2.x.x`. This project uses the `docker compose` subcommand instead of the legacy `docker-compose` command.

## Deployment

### 1. Clone the Repository

Replace `<repository-url>` with the Git repository URL:

```bash
git clone <repository-url> /path-to-sourcify
cd /path-to-sourcify
```

### 2. Configure Environment Variables

Docker Compose reads the `.env` file from the project root. Copy the template and then update it as needed:

```bash
cp .env-template .env
```

The MySQL settings are required and must contain valid database connection information:

```dotenv
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USERNAME=root
MYSQL_PASSWORD=your-password
MYSQL_DATABASE=verification
```

Make sure the target database exists and that the configured user has permission to read, write, and create tables in it.

The following settings are optional and show their default values. Refer to `config/Config.ts` for the complete configuration:

```dotenv
SERVER_PORT=17651
SERVER_MAX_FILE_SIZE=31457280
SERVER_ENABLE_PROFILE=

HTTP_PROXY=

SOLC_REPO_BIN=./solc-repo/bin
SOLC_REPO_JS=./solc-repo/js
VYPER_REPO=./vyper-repo
FE_REPO=./fe-repo

CHAIN_1_RPC_1=http://test.confluxrpc.com
CHAIN_1_RPC_2=http://test-internal.confluxrpc.com
CHAIN_71_RPC_1=http://evmtestnet.confluxrpc.com
CHAIN_71_RPC_2=http://evmtestnet-internal.confluxrpc.com
CHAIN_1029_RPC_1=http://main.confluxrpc.com
CHAIN_1029_RPC_2=http://main-internal.confluxrpc.com
CHAIN_1030_RPC_1=http://evm.confluxrpc.com
CHAIN_1030_RPC_2=http://evm-internal.confluxrpc.com
CHAIN_8888_RPC_1=http://net8888cfx.confluxrpc.com/
CHAIN_8889_RPC_1=http://net8889eth.confluxrpc.com/
```

To enable DingTalk or Telegram alerts, or to access an Etherscan API that requires authentication, configure the `DINGTALK_*`, `TELEGRAM_*`, and `ETHERSCAN_API_KEY` variables as needed.

### 3. Build the Image

```bash
docker compose build
```

### 4. Create the Containers

Create the verification and monitoring containers:

```bash
docker compose create verification
docker compose create monitor
```

### 5. Start the Containers

```bash
docker compose start verification
docker compose start monitor
```

### 6. Check the Service Status

```bash
docker compose ps
docker compose logs -f verification monitor
```

The verification service listens on port `17651` by default. Use the health endpoint to confirm that it is available:

```bash
curl http://127.0.0.1:17651/health
```

The expected response is:

```text
Alive and kicking!
```

## Running Containers

The deployment starts the following containers:

1. `verification`: Handles smart contract verification requests.
2. `monitor`: Synchronizes verification data for contract methods submitted by users.

## Stop and Restart

```bash
docker compose stop verification monitor
docker compose start verification monitor
```

To stop and remove the containers:

```bash
docker compose down
```