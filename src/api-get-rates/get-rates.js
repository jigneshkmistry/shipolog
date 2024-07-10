//#region IMPORT

const util = require('util');
var shipstationAPI = require('node-shipstation');
const _ = require('lodash');
const connectToDb = require('./pg-connect');

//#endregion

//#region INITIALIZATION


//#endregion

//#region HANDLER

exports.handler = async (event) => {

    console.log("Event : " + JSON.stringify(event));
    const db_client = await connectToDb(process.env.connectionString);
    try {
        const promises = [];
        let shipstation;
        let carrirList = [{ code: 'ups_walleted' }, { code: 'stamps_com' }];
        const body = event.body ? JSON.parse(event.body) : {};
        const user_email = event?.headers?.['Shipolog-User-Email'];

        if (user_email) {
            console.log("user_email key used : " + user_email);
            let client_row = await getClientByUser(db_client, user_email);
            shipstation = new shipstationAPI(client_row.apikey, client_row.apisecret);
            db_client.release();
        }
        else {
            console.log("hardcoded key used : ");
            shipstation = new shipstationAPI(process.env.api_key, process.env.secret);
        }

        const getShippingRatesAsync = util.promisify(shipstation.getShippingRates);
        
        carrirList.forEach(element => {
            const getRatesBody = { ...body };
            getRatesBody.carrierCode = element.code;
            promises.push(getShippingRatesAsync(getRatesBody))
        });

        let ratesByCarrierResponse = await Promise.all(promises);
      
        let result = ratesByCarrierResponse.map(x => {
            const rateResponse = x.toJSON();            
            const req_body = JSON.parse(x.request.body);
            const carrier = _.find(carrirList, { code: req_body.carrierCode });
            if (rateResponse.statusCode === 200) {
                carrier.services = _.sortBy(rateResponse.body, ['shipmentCost']);
                return carrier;
            }
            else {
                carrier.services = [];
                carrier.error = rateResponse?.body?.ExceptionMessage ? rateResponse?.body?.ExceptionMessage : "An unexpected error occurs";
                return carrier;
            }
        });

        // Extract the headers from the object with the maximum date
        const maxDateHeaders = _.maxBy(ratesByCarrierResponse, response => new Date(response.headers.date)).headers;
      
        return prepareAPIResponse(200, result, maxDateHeaders);
    }
    catch (err) {
        db_client.release();
        console.log("Error in API :" + JSON.stringify(err));
        return prepareAPIResponse(500, {
            message: 'An unexpected error occurs. Please try again',
            code: 'ERROR_IN_GET_RATES_API'
        });
    }
}

//#endregion

//#region UTILS

function prepareAPIResponse(statusCode, body, headers) {
    return {
        statusCode: statusCode,
        body: JSON.stringify(body),
        headers: {
            'Access-Control-Allow-Origin': '*', // Required for CORS support to work
            'Access-Control-Allow-Methods': '*',
            'X-Rate-Limit-Limit': headers['x-rate-limit-limit'],
            'X-Rate-Limit-Reset': headers['x-rate-limit-reset'],
            'X-Rate-Limit-Remaining': headers['x-rate-limit-remaining'],
            'Access-Control-Allow-Headers': '*',
            'Access-Control-Allow-Credentials': 'true', // Required for cookies, authorization headers with HTTPS
            'Content-Type': 'application/json',
            'Strict-Transport-Security': 'max-age=31536000',
          }
    };
}

//#endregion

//#region RDS

async function getClientByUser(client, userEmail) {

    const query = `select c.clientid,c.apikey,c.apisecret from users u inner join clients c on u.clientid = c.clientid where u.useremail = $1`
    return _.get(await client.query(query, [userEmail]), 'rows.0')
}

//#endregion