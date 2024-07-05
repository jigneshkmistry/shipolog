process.env.api_key = 'fa754a40f1ef4ff698242ce6adaaa899';
process.env.secret = '8764e80c4ceb4e03830b056f982f03b9';
process.env.ORDER_WITH_ITEM_TABLE_NAME = 'OrdersWithItems';
process.env.connectionString = 'postgres://postgres:F00tball@devshipolog3.ctlqnvlxqcmr.us-east-1.rds.amazonaws.com:5432/dev-shipolog';

var event = require('../events/get-partners.json');
var app = require('../get-partners');

app.handler(event).then(data => {
    console.log("API response :" + JSON.stringify(data));
}).catch(error => {
    console.log("API error :" + JSON.stringify(error));
})