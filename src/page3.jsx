import React, { Component } from 'react';
import {BootstrapTable, TableHeaderColumn} from 'react-bootstrap-table';
import "../node_modules/react-bootstrap-table/dist/react-bootstrap-table-all.min.css";


const products = [
    {'name':"2D Procedural Generation", 'desc':"Conway's game of life based proc gen", 'date':"01/10/2020",'tool':"Unity, C#",link:"https://github.com/brennengreen/2D-Procedural-Generation" },
    {'name':"Ditto", 'desc':"A media assisting bot for Discord", 'date':"06/28/2019",'tool':"Python",link:"https://github.com/brennengreen/ditto" },
    {'name':"GoList", 'desc':"WebScraper that stores data in postgresql db", 'date':"03/21/2019",'tool':"Golang, SQL",link:"https://github.com/brennengreen/golist" },
    {'name':"My Portfolio", 'desc':"A website to show off my personality and technical interests", 'tool':"WebDev w/ JS",'link':"https://github.com/brennengreen/brennengreen.dev"},
    {'name':"pystudy", 'desc':"Virtual flash cards", 'date':"08/28/2018",'tool':"Python",link:"https://github.com/brennengreen/pystudy" },
    {'name':"pybrarian", 'desc':"Wiki-web-scraper, provides info such as Author, Length, general summary of any book user provides on CLI",
            'date':"08/05/2018",'tool':"Python", link:"https://github.com/brennengreen/pybrarian"},
    {'name':"pytax", 'desc':"A tax calculator which uses the TaxJar sales api to help users figure out tax costs",
        'date':"11/04/2018",'tool':"Python", link:"https://github.com/brennengreen/pytax"}];


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