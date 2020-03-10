import {Entity, PrimaryGeneratedColumn, Column} from "typeorm";

@Entity()
export class Car {

    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    make: string;

    @Column()
    model: string;

    @Column()
    vin: string;

}
