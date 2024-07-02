process.env.google_api_key = 'AIzaSyAY9gltBIGP9mNoGP387BrjWFi-K3883vc';


var event = require('../events/get-validate-google-address.json');
var app = require('../get-validate-google-address');

app.handler(event).then(data => {
    console.log("API response :" + JSON.stringify(data));
}).catch(error => {
    console.log("API error :" + JSON.stringify(error));
})