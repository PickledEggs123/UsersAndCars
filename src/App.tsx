/**
 * Simple React Tabbed App. The app contains three tabs to render three different views.
 */
import React from 'react';
import './App.scss';
import {Route, BrowserRouter, Switch, Link} from 'react-router-dom';
import {Persons} from "./Persons";
import {Cars} from "./Cars";
import {Users} from "./Users";
import {AppTabs} from "./AppTabs";

interface IAppProps {}

/**
 * The state of the App component.
 */
interface IAppState {}

/**
 * The root app component which renders different pages.
 */
class App extends React.Component<IAppProps, IAppState> {
    state = {} as IAppState;

    /**
     * Draw the selected tab onto the page.
     */
    renderTab = () => {
    };

    render() {
        return (
            <BrowserRouter>
                <Route component={AppTabs}/>
                {/* Render the tab onto the screen */}
                <Switch>
                    <Route path="/persons" component={Persons}/>
                    <Route path="/users" component={Users}/>
                    <Route path="/cars" component={Cars}/>
                    <Route component={Persons}/>
                </Switch>
            </BrowserRouter>
        );
    }
}

export default App;
