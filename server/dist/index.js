import express from 'express';
import cors from 'cors';
import healthRoutes from './routes/health.js';
const app = express();
const PORT = process.env.PORT || 3001;
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }));
app.use(express.json());
app.use('/api', healthRoutes);
app.listen(PORT, () => {
    console.log(`AURA HOMES API running on port ${PORT}`);
});
export default app;
//# sourceMappingURL=index.js.map