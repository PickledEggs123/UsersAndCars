import {getRepository} from "typeorm";
import {NextFunction, Request, Response} from "express";
import {Car} from "../entity/Car";

export class CarController {

    private carRepository = getRepository(Car);

    async all(request: Request, response: Response, next: NextFunction) {
        return this.carRepository.find();
    }

    async one(request: Request, response: Response, next: NextFunction) {
        return this.carRepository.findOne(request.params.id);
    }

    async save(request: Request, response: Response, next: NextFunction) {
        return this.carRepository.save(request.body);
    }

    async remove(request: Request, response: Response, next: NextFunction) {
        let carToRemove = await this.carRepository.findOne(request.params.id);
        await this.carRepository.remove(carToRemove);
        response.sendStatus(200);
    }

}