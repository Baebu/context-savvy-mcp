// Basic test to verify Jest setup
describe('Context-Savy Server', () => {
  test('should be defined', () => {
    expect(true).toBe(true);
  });

  test('environment should be test', () => {
    expect(process.env.NODE_ENV).toBe('test');
  });
});
