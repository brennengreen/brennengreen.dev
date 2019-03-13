import React, { Component } from 'react';
import {BootstrapTable, TableHeaderColumn} from 'react-bootstrap-table';
import "../node_modules/react-bootstrap-table/dist/react-bootstrap-table-all.min.css";


const products = [
                    {'name':"pystudy", 'desc':"Virtual flash cards", 'date':"08/28/2018",'tool':"Python",link:"https://github.com/brennengreen/pystudy" },
                    {'name':"pybrarian", 'desc':"Wiki-web-scraper, provides info such as Author, Length, general summary of any book user provides on CLI",
                         'date':"08/05/2018",'tool':"Python", link:"https://github.com/brennengreen/pybrarian"},
                    {'name':"pytax", 'desc':"A tax calculator which uses the TaxJar sales api to help users figure out tax costs",
                     'date':"11/04/2018",'tool':"Python", link:"https://github.com/brennengreen/pytax"},
                    {'name':"My Portfolio", 'desc':"A website to show off my personality and technical interests", 'tool':"WebDev w/ JS",'link':"xxx"}];


const Main = () => {
    return (
        <BootstrapTable version='4' data={ products } striped hover>
            <TableHeaderColumn isKey dataField='name'>Project Name</TableHeaderColumn>
            <TableHeaderColumn dataField='desc'>Description</TableHeaderColumn>
            <TableHeaderColumn dataField='date'>Completion Date</TableHeaderColumn>
            <TableHeaderColumn dataField='tool'>Primary Tool</TableHeaderColumn>
            <TableHeaderColumn dataField='link'>Repo Link</TableHeaderColumn>
        </BootstrapTable>
    )
}

export default Main;