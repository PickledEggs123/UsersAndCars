/**
 * Simple React Tabbed App. The app contains three tabs to render three different views.
 */
import React from 'react';
import './App.scss';
import {Persons} from "./Persons";
import {Cars} from "./Cars";
import {Users} from "./Users";

interface IAppProps {}

/**
 * The tabs to render.
 */
enum EAppTab {
    /**
     * Render a game containing movable persons.
     */
    PERSONS = "persons",
    /**
     * Render a CRUD editor for users.
     */
    USERS = "users",
    /**
     * Render a CRUD editor for cars.
     */
    CARS = "cars"
}

/**
 * The state of the App component.
 */
interface IAppState {
    tab: EAppTab;
}

/**
 * The root app component which renders different pages.
 */
class App extends React.Component<IAppProps, IAppState> {
    state = {
        tab: EAppTab.PERSONS
    } as IAppState;

    /**
     * Change the currently displayed tab.
     * @param tab The selected tab.
     */
    setTab = (tab: EAppTab) => () => {
        this.setState({tab});
    };

    /**
     * Draw the selected tab onto the page.
     */
    renderTab = () => {
        switch (this.state.tab) {
            case EAppTab.PERSONS: return <Persons/>;
            case EAppTab.USERS: return <Users/>;
            case EAppTab.CARS: return <Cars/>;
        }
    };

    render() {
        return (
            <div>
                {/* A tab bar to select one of three tabs */}
                <div style={{gridTemplateRows: "repeat(1fr, 3)", width: 500}}>
                    {
                        [EAppTab.PERSONS, EAppTab.USERS, EAppTab.CARS].map(tab => {
                            return (
                                <div style={{
                                    display: "inline-block",
                                    padding: 10,
                                    margin: 5,
                                    backgroundColor: this.state.tab === tab ? "blue" : "lightblue"
                                }} onClick={this.setTab(tab)}>{tab}</div>
                            );
                        })
                    }
                </div>
                {
                    /* Render the tab onto the screen */
                    this.renderTab()
                }
            </div>
        );
    }
}

export default App;
