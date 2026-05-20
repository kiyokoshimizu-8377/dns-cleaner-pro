const net = require('net');

const client = new net.Socket();
console.log('Connecting to Redis at 20.112.19.16:6379...');

client.connect(6379, '20.112.19.16', () => {
  console.log('Successfully connected to Redis port 6379!');
  client.destroy();
});

client.on('error', (err) => {
  console.error('Connection error:', err.message);
});

client.on('close', () => {
  console.log('Connection closed.');
});
