import * as functions from "firebase-functions";
import * as express from 'express';
import * as api from "./api.js";
import cors from 'cors';

export const roomsTimeSlots = functions.region('europe-west1')
        .https.onRequest((request: express.Request, response: express.Response<any>) => {
    cors({
        origin: true,
        optionsSuccessStatus: 200
    })(request, response, () => {
        api.getRoomAvailability().then(cal => {
            response.json({
                status: "ok",
                data: cal
            });
        }).catch(error => {
            response.json({
                status: "ko",
                error: error
            });
        });
    });
});