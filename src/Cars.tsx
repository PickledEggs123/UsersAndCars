import React from 'react';
import './App.scss';
import axios from "axios";

interface ICarsProps {}

interface ICar {
    id: number;
    make: string;
    model: string;
    vin: string;
}

interface ICarsState {
    cars: ICar[];
    make: string;
    model: string;
    vin: string;
}

export class Cars extends React.Component<ICarsProps, ICarsState> {
    state = {
        cars: [],
        make: "",
        model: "",
        vin: ""
    } as ICarsState;

    componentDidMount(): void {
        this.fetchCars();
    }

    fetchCars = async () => {
        const response = await axios.get("https://us-central1-tyler-truong-demos.cloudfunctions.net/cars");
        this.setState({
            cars: response.data
        });
    };

    deleteCar = (user: ICar) => async () => {
        await axios.delete(`https://us-central1-tyler-truong-demos.cloudfunctions.net/cars/${user.id}`);
        await this.fetchCars();
    };

    validNewCarData = () => {
        return this.state.make && this.state.model && this.state.vin;
    };

    addCar = async () => {
        if (this.validNewCarData()) {
            const {
                make,
                model,
                vin
            } = this.state;

            const data = {
                make,
                model,
                vin
            };
            await axios.post("https://us-central1-tyler-truong-demos.cloudfunctions.net/cars", data);
            await this.fetchCars();
            this.setState({
                make: "",
                model: "",
                vin: ""
            });
        }
    };

    updateInput = (field: keyof Pick<ICarsState, "make" | "model" | "vin">) => (event: React.ChangeEvent<HTMLInputElement>) => {
        this.setState({[field]: event.target.value} as any);
    };

    render() {
        return (
            <div className="cars">
                <h1>Cars</h1>
                <div>
                    <h2>Create Car</h2>
                    <div>
                        <label>Make: </label>
                        <input onChange={this.updateInput("make")} value={this.state.make}/>
                    </div>
                    <div>
                        <label>Model: </label>
                        <input onChange={this.updateInput("model")} value={this.state.model}/>
                    </div>
                    <div>
                        <label>VIN: </label>
                        <input onChange={this.updateInput("vin")} value={this.state.vin}/>
                    </div>
                    <div className={`create${this.validNewCarData() ? "" : " disabled"}`}
                         onClick={this.validNewCarData() ? this.addCar : undefined}
                    >
                        Add New Car
                    </div>
                </div>
                <div>
                    {
                        this.state.cars.map(car => {
                            return (
                                <div className="item" key={car.id}>
                                    <div className="row">CarID: {car.id}</div>
                                    <div className="row">Make: {car.make}</div>
                                    <div className="row">Model: {car.model}</div>
                                    <div className="row">VIN: {car.vin}</div>
                                    <div className="delete row" onClick={this.deleteCar(car)}>Delete</div>
                                </div>
                            );
                        })
                    }
                </div>
            </div>
        );
    }
}
