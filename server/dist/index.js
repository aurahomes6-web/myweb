import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import healthRoutes from './routes/health.js';
import availabilityRoutes from './routes/availability.js';
import bookingRoutes from './routes/bookings.js';
import propertyRoutes from './routes/properties.js';
import airbnbRoutes from './routes/airbnb.js';
import couponRoutes from './routes/coupons.js';
import adminRoutes from './routes/admin.js';
const app = express();
const PORT = process.env.PORT || 3001;
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json());
app.use('/api', healthRoutes);
app.use('/api/availability', availabilityRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/properties', propertyRoutes);
app.use('/api/airbnb', airbnbRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/admin', adminRoutes);
app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
});
app.listen(PORT, () => {
    console.log(`AURA HOMES API running on port ${PORT}`);
});
export default app;
//# sourceMappingURL=index.js.map