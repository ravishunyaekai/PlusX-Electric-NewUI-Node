
import mqtt from 'mqtt';

let options = {
    port            : 8083,
    host            : 'supro.shunyaekai.tech',
    clientId        : 'plusxnode',
    username        : 'plusx',
    password        : '3:m|aG2c`3sU?8~I6£*',
    keepalive       : 60,
    // reconnectPeriod : 1000,
    // protocolId      : 'MQIsdp',
    // protocolVersion : 4,
    // clean           : true,
    // encoding        : 'utf8'
};
var client = mqtt.connect('mqtt://supro.shunyaekai.tech:8083', options);
client.on('connect', function() {
    console.log('connected mqtt');
    // subscribe to a topic
    client.subscribe('/driver/data', function() { 
        
        client.on('message', (topic, message, packet) => {
        // Avoid manually handling PUBACK
            if (packet.cmd === 'puback') {
                console.error('PUBACK should not be manually handled.');
            }
        });
    });
    
    // client.publish('get/ravv', 'Msg by ravv', { qos: 1, retain: false }, (err) => {
    //     if (err) {
    //         console.error('Error publishing message:', err);
    //     } else {
    //         console.log(`Message published to ${topic}`);
    //     }
    //     client.end();
    // });
});
client.on('error', (err) => {
    console.error('Error:', err.message);
});