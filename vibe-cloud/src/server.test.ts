/**
 * Basic tests for the server
 * To run: npm test
 */
import request from 'supertest';
import server from './server';

describe('Server API', () => {
    afterAll((done) => {
        server.close(done);
    });

    test('GET / returns service information', async () => {
        const response = await request(server).get('/');
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('service', 'vibe-cloud');
        expect(response.body).toHaveProperty('status', 'running');
    });

    test('GET /health returns healthy status', async () => {
        const response = await request(server).get('/health');
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('status', 'healthy');
    });

    test('POST /api/turn/credentials requires userId', async () => {
        const response = await request(server)
            .post('/api/turn/credentials')
            .send({});
        expect(response.status).toBe(400);
    });

    test('POST /api/turn/credentials returns credentials', async () => {
        const response = await request(server)
            .post('/api/turn/credentials')
            .send({ userId: 'test-user' });
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('username');
        expect(response.body).toHaveProperty('credential');
        expect(response.body).toHaveProperty('ttl');
        expect(response.body).toHaveProperty('urls');
    });

    test('GET /api/stats returns server statistics', async () => {
        const response = await request(server).get('/api/stats');
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('roomCount');
        expect(response.body).toHaveProperty('peerCount');
        expect(response.body).toHaveProperty('uptime');
    });
});