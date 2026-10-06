const redis = require('redis');

const redisClient = redis.createClient({
    // Default connection: redis://localhost:6379
    // You can specify connection details if your Redis server is elsewhere:
    // url: 'redis://your-redis-host:your-redis-port'
});

redisClient.on('error', (err) => {
    console.error('❌ Redis Client Error:', err);
    // In a production environment, you might want to implement a retry strategy
    // or a way to gracefully degrade if Redis is unavailable.
});

redisClient.on('connect', () => {
    console.log('✅ Connected to Redis server.');
});

// Connect the client. As of node-redis v4, connect() returns a promise.
// We'll connect here and handle errors. Functions using the client should
// assume it will connect or handle its state.
async function connectRedis() {
    try {
        if (!redisClient.isOpen) { // Check if already open or trying to connect
            await redisClient.connect();
        }
    } catch (err) {
        console.error('❌ Failed to connect to Redis:', err);
        // Optionally, re-throw or handle to prevent app from starting if Redis is critical
    }
}

connectRedis(); // Attempt to connect when the module is loaded

module.exports = redisClient; 