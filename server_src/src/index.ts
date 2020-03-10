import "reflect-metadata";
import {createConnection} from "typeorm";
import * as express from "express";
import * as bodyParser from "body-parser";
import {Request, Response} from "express";
import {Routes} from "./routes";
import {User} from "./entity/User";
import {Car} from "./entity/Car";
import * as firebase from "firebase/app";
import "firebase/analytics";

firebase.initializeApp();

createConnection().then(async connection => {

    // create express app
    const app = express();
    app.use(bodyParser.json());

    // register express routes from defined application routes
    Routes.forEach(route => {
        (app as any)[route.method](route.route, (req: Request, res: Response, next: Function) => {
            const result = (new (route.controller as any))[route.action](req, res, next);
            if (result instanceof Promise) {
                result.then(result => result !== null && result !== undefined ? res.send(result) : undefined);

            } else if (result !== null && result !== undefined) {
                res.json(result);
            }
        });
    });

    // setup express app here
    // ...

    // start express server
    app.listen(3001);

    // insert new users for test
    await connection.manager.save(connection.manager.create(User, {
        firstName: "Timber",
        lastName: "Saw",
        age: 27
    }));
    await connection.manager.save(connection.manager.create(User, {
        firstName: "Phantom",
        lastName: "Assassin",
        age: 24
    }));

    // insert new users for test
    await connection.manager.save(connection.manager.create(Car, {
        make: "Honda",
        model: "Accord",
        vin: "HD1234"
    }));
    await connection.manager.save(connection.manager.create(Car, {
        make: "Chevrolet",
        model: "Malibu",
        vin: "CV1234"
    }));

    console.log("Express server has started on port 3001. Open http://localhost:3001/users to see results");

}).catch(error => console.log(error));
