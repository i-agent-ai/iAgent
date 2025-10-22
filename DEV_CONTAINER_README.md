# iAgent Development Environment

This project uses a simple Dev Container setup for consistent development environment.

## Prerequisites

- Docker Desktop
- VS Code with the Dev Containers extension
- Git

## Getting Started

1. **Clone the repository** (if not already done):
   ```bash
   git clone <repository-url>
   cd iAgent
   ```

2. **Open in Dev Container**:
   - Open VS Code
   - Open the project folder
   - When prompted, click "Reopen in Container" or use the Command Palette (`Ctrl+Shift+P`) and select "Dev Containers: Reopen in Container"

3. **Wait for setup**:
   - The container will build and install dependencies
   - All npm packages will be installed
   - The project will be built automatically

## Development Environment

### Container Details
- **Image**: `mcr.microsoft.com/devcontainers/typescript-node:20-bullseye`
- **Features**: Git, GitHub CLI
- **Extensions**: Nx Console, TypeScript, Tailwind CSS, ESLint, Prettier, MongoDB tools, and more

### Database
The application runs in **DEMO MODE** by default, which means:
- No MongoDB connection required
- Data is stored in memory (not persistent)
- Perfect for development and testing

## Environment Variables

The following environment variables are automatically set:

- `NODE_ENV=development`
- `NX_CLOUD_DISTRIBUTED_EXECUTION=false`
- `DEMO_MODE=true`

## Development Commands

Once the container is running:

```bash
# Install dependencies (if needed)
npm install

# Start development servers
npm run dev

# Run tests
npm test

# Build all projects
npx nx run-many --target=build --all

# Run specific project
npx nx serve frontend
npx nx serve backend
```

## Ports

- **Frontend**: 3000
- **Backend**: 3001
- **Alternative Frontend**: 4200
- **Local Registry**: 4873

## Troubleshooting

### Container Issues
- Rebuild container: Command Palette → "Dev Containers: Rebuild Container"
- Check container logs in VS Code's Dev Containers output panel

### Port Conflicts
If you have conflicts with the default ports, modify the `forwardPorts` section in `.devcontainer/devcontainer.json`.

## File Structure

```
iAgent/
├── .devcontainer/
│   └── devcontainer.json      # Dev container configuration
├── apps/
│   ├── frontend/             # React frontend
│   └── backend/              # NestJS backend
└── libs/                     # Shared libraries
```

## Remote MongoDB Setup

If you need to connect to a remote MongoDB database over the internet:

### Option 1: Update Environment Variables in devcontainer.json
```json
"containerEnv": {
  "DEMO_MODE": "false",
  "MONGODB_URI": "mongodb://username:password@your-remote-host:27017/database"
}
```

### Option 2: Use Environment Variables at Runtime
```bash
# Set environment variables before running
export DEMO_MODE=false
export MONGODB_URI="mongodb://username:password@your-remote-host:27017/database"

# Then start the application
npm run dev
```

### MongoDB Connection String Examples

**Local MongoDB:**
```
mongodb://localhost:27017/iagent
```

**Remote MongoDB Server:**
```
mongodb://username:password@your-server.com:27017/iagent
```

**MongoDB Atlas (Cloud):**
```
mongodb+srv://username:password@cluster.mongodb.net/iagent
```

**MongoDB with Authentication:**
```
mongodb://username:password@host:port/database?authSource=admin
```

### How It Works

- **DEMO_MODE=true**: App runs without MongoDB (in-memory storage)
- **DEMO_MODE=false**: App connects to MongoDB using MONGODB_URI
- The backend automatically detects database availability and switches modes
- No local MongoDB installation required - connect to any remote MongoDB over the internet
