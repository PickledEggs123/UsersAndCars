import * as admin from "firebase-admin";
import {
    IApiPersonsVoiceAnswerMessage,
    IApiPersonsVoiceCandidateMessage,
    IApiPersonsVoiceOfferMessage
} from "./types/GameTypes";
import * as express from "express";

/**
 * Handle WebRTC signaling messages with HTTP posts. WebRTC requires some messages to be passed around to begin a voice
 * chat session. The functions in this file handle and move the messages around.
 *
 * Candidates are possible peer to peer connection that a client has identified. Both clients will send each other candidates
 * until they find a matching pair.
 *
 * Offer is the beginning of a voice chat call. The caller will pass the callee an offer message. The callee will respond
 * with an Answer message.
 */

/**
 * Get voice related messages for WebRTC voice chat.
 */
export const getVoiceMessages = async (id: string) => {
    const candidates: IApiPersonsVoiceCandidateMessage[] = [];
    const offers: IApiPersonsVoiceOfferMessage[] = [];
    const answers: IApiPersonsVoiceAnswerMessage[] = [];

    // a list of WebRTC ICE candidates to add
    {
        const querySnapshot = await admin.firestore().collection("voiceCandidates")
            .where("to", "==", id)
            .get();

        for (const documentSnapshot of querySnapshot.docs) {
            const message = documentSnapshot.data() as IApiPersonsVoiceCandidateMessage;

            await documentSnapshot.ref.delete();

            candidates.push(message);
        }
    }

    // list of WebRTC socket descriptions to add
    {
        const querySnapshot = await admin.firestore().collection("voiceOffers")
            .where("to", "==", id)
            .get();

        for (const documentSnapshot of querySnapshot.docs) {
            const message = documentSnapshot.data() as IApiPersonsVoiceOfferMessage;

            await documentSnapshot.ref.delete();

            offers.push(message);
        }
    }

    // list of WebRTC socket descriptions to add
    {
        const querySnapshot = await admin.firestore().collection("voiceAnswers")
            .where("to", "==", id)
            .get();

        for (const documentSnapshot of querySnapshot.docs) {
            const message = documentSnapshot.data() as IApiPersonsVoiceAnswerMessage;

            await documentSnapshot.ref.delete();

            answers.push(message);
        }
    }

    return {
        candidates,
        offers,
        answers
    };
};

export const handleVoiceMessageCandidate = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    (async () => {
        await admin.firestore().collection("voiceCandidates").add(req.body);
        res.sendStatus(201);
    })().catch((err) => next(err));
};

export const handleVoiceMessageOffer = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    (async () => {
        await admin.firestore().collection("voiceOffers").add(req.body);
        res.sendStatus(201);
    })().catch((err) => next(err));
};

export const handleVoiceMessageAnswer = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    (async () => {
        await admin.firestore().collection("voiceAnswers").add(req.body);
        res.sendStatus(201);
    })().catch((err) => next(err));
};
