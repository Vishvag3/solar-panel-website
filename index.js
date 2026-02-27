const SerialPort = require('serialport');
const Readline = require('@serialport/parser-readline');
const WebSocket = require('ws');

// Replace "COM3" with your Arduino port
const port = new SerialPort("COM3", { baudRate: 9600 });
const parser = port.pipe(new Readline({ delimiter: '\n' }));

const wss = new WebSocket.Server({ port: 8080 });

parser.on('data', line => {
  wss.clients.forEach(client => {
    if(client.readyState === WebSocket.OPEN){
      client.send(line);
    }
  });
});

wss.on('connection', ws => console.log('Frontend connected'));

console.log('Server running on ws://localhost:8080');