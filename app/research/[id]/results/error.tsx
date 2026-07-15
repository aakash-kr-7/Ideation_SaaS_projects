"use client";
export default function Error({error,reset}:{error:Error&{digest?:string};reset:()=>void}){return <main className="report-error"><h1>We couldn’t load this report.</h1><p>{error.message||"The completed run is missing required report data."}</p><button onClick={reset}>Try again</button></main>}
