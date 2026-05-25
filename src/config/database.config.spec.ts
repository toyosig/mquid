describe('databaseConfig', () => {
  it('reads env vars into database config shape', () => {
    process.env.DB_HOST = 'localhost';
    process.env.DB_PORT = '5432';
    process.env.DB_USERNAME = 'postgres';
    process.env.DB_PASSWORD = 'pass';
    process.env.DB_NAME = 'testdb';

    // registerAs returns a factory; call it
    const factory = require('./database.config').default;
    const config = factory();
    expect(config.host).toBe('localhost');
    expect(config.port).toBe(5432);
    expect(config.name).toBe('testdb');
  });
});
