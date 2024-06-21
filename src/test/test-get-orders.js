process.env.api_key = 'fa754a40f1ef4ff698242ce6adaaa899';
process.env.secret = '8764e80c4ceb4e03830b056f982f03b9';

var event = require('../events/get-orders.json');
var app = require('../get-orders');

app.handler(event).then(data => {
    console.log("API response :" + JSON.stringify(data));
}).catch(error => {
    console.log("API error :" + JSON.stringify(error));
})