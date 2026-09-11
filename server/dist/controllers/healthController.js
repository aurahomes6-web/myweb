export function healthCheck(_req, res) {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        service: 'AURA HOMES API',
    });
}
//# sourceMappingURL=healthController.js.map