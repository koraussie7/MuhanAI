module.exports = {
  apps: [{
    name: "muhanai-agentmesh-api",
    script: "services/api/dist/server.js",
    cwd: "/opt/agentmesh",
    env: { NODE_ENV: "production", HOST: "127.0.0.1", PORT: "3012" },
    autorestart: true,
    max_restarts: 10,
  }],
};
