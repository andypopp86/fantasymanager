import React, {useState} from "react";
import { draftCreate } from "../lib/data";

export default function DraftList({ send }) {
    const [draftName, setDraftName] = useState("Sparks Beta");
    const [managers, setManagers] = useState(`Andy*
Jake
BMO
Vell
Lee
Lem
Gill
Russ
Marini
Norton`);
    const [startingBudget, setStartingBudget] = useState(200);
    const [rounds, setRounds] = useState(19);
    const [limitQB, setLimitQB] = useState(3);
    const [limitRB, setLimitRB] = useState(8);
    const [limitWR, setLimitWR] = useState(8);
    const [limitTE, setLimitTE] = useState(3);
    const [limitDEF, setLimitDEF] = useState(2);

    const handleDraftCreateSubmit = () => {
        if (draftName === "") {
            alert("Draft Name is required");
            return;
        }
        if (managers === "") {
            alert("Managers are required");
            return;
        }
        if (!managers.includes("*")) {
            alert("1 Manager must contain a * to indicate the drafter");
            return;
        }
        if (!managers.includes("\n")) {
            alert("Managers must be separated by lines");
            return;
        }
        const draftData = {
            draft_name: draftName,
            managers: managers,
            starting_budget: startingBudget,
            rounds: rounds,
            limit_qb: limitQB,
            limit_rb: limitRB,
            limit_wr: limitWR,
            limit_te: limitTE,
            limit_def: limitDEF,
        }
        draftCreate({ ...draftData }).then((response) => {
            send({type: "draft.create", draft: response.data});
        });
    }


    const inputStyle = "appearance-none block w-full bg-gray-200 text-gray-700 border rounded py-3 px-4 mb-3 leading-tight focus:outline-none focus:bg-white";

    return (
            <div className="min-h-screen flex items-center justify-center bg-gray-100">
                <div className="max-w-md w-full p-6 bg-white shadow-lg rounded-lg">
                <h1 className="mb-2">Create Draft</h1>
                <div className={"flex flex-wrap -mx-3 mb-2"}>
                    <div className={"w-full px-3 mb-6 md:mb-0"}>
                        <button className={"btn bg-green-500 text-white"} onClick={() => handleDraftCreateSubmit()}>Create Draft</button>
                    </div>
                </div>
                <form className={"w-full max-w-lg"}>
                    <div className={"flex flex-wrap -mx-3 mb-6"}>
                        <div className={"w-full md:w-1/2 px-3 mb-6 md:mb-0"}>
                            <label className={"block uppercase tracking-wide text-gray-700 text-xs font-bold mb-2"} htmlFor="draft_name">
                                Draft Name
                            </label>
                            <input className={inputStyle} id="draft_name" type="text" placeholder="Draft Name" onChange={(e) => setDraftName(e.target.value)} value={draftName}></input>
                        </div>
                    </div>
                    <div className={"flex flex-wrap -mx-3 mb-6"}>
                        <div className={"w-full md:w-full px-3 mb-6 md:mb-0"}>
                            <label className={"block uppercase tracking-wide text-gray-700 text-xs font-bold mb-2"} htmlFor="managers">
                                Managers
                            </label>
                            <textarea className={" no-resize appearance-none block w-full bg-gray-200 text-gray-700 border rounded py-3 px-4 mb-3 leading-tight focus:outline-none focus:bg-white focus:border-gray-500 h-48"} 
                            id="managers" placeholder="List of Managers - * next to the drafter - Separate managers by line"
                            onChange={(e) => setManagers(e.target.value)}
                            value={managers}
                            ></textarea>
                        </div>
                    </div>
                    <div className={"flex flex-wrap -mx-3 mb-6"}>
                        <div className={"w-full md:w-1/2 px-3 mb-6 md:mb-0"}>
                            <label className={"block uppercase tracking-wide text-gray-700 text-xs font-bold mb-2"} htmlFor="starting_budget">
                                Starting Budget
                            </label>
                            <input className={inputStyle} id="starting_budget" type="text" placeholder="Default: $200" onChange={(e) => setStartingBudget(parseInt(e.target.value))} value={startingBudget}></input>
                        </div>
                    </div>
                    <div className={"flex flex-wrap -mx-3 mb-6"}>
                        <div className={"w-full md:w-full px-3 mb-6 md:mb-0"}>
                            <label className={"block uppercase tracking-wide text-gray-700 text-xs font-bold mb-2"} htmlFor="rounds">
                                Rounds
                            </label>
                            <input className={inputStyle} id="rounds" placeholder="Amount of Rounds" onChange={(e) => setRounds(parseInt(e.target.value))} value={rounds}></input>
                        </div>
                    </div>
                    <div className={"flex flex-wrap -mx-3 mb-6"}>
                        <div className={"w-full md:w-full px-3 mb-6 md:mb-0"}>
                            <label className={"block uppercase tracking-wide text-gray-700 text-xs font-bold mb-2"} htmlFor="limit_qb">
                                QB Limit
                            </label>
                            <input className={inputStyle} id="limit_qb" placeholder="QB Limit" onChange={(e) => setLimitQB(parseInt(e.target.value))} value={limitQB}></input>
                        </div>
                        <div className={"w-full md:w-full px-3 mb-6 md:mb-0"}>
                            <label className={"block uppercase tracking-wide text-gray-700 text-xs font-bold mb-2"} htmlFor="limit_rb">
                                RB Limit
                            </label>
                            <input className={inputStyle} id="limit_rb" placeholder="RB Limit" onChange={(e) => setLimitRB(parseInt(e.target.value))} value={limitRB}></input>
                        </div>
                        <div className={"w-full md:w-full px-3 mb-6 md:mb-0"}>
                            <label className={"block uppercase tracking-wide text-gray-700 text-xs font-bold mb-2"} htmlFor="limit_wr">
                                WR Limit
                            </label>
                            <input className={inputStyle} id="limit_wr" placeholder="WR Limit" onChange={(e) => setLimitWR(parseInt(e.target.value))} value={limitWR}></input>
                        </div>
                        <div className={"w-full md:w-full px-3 mb-6 md:mb-0"}>
                            <label className={"block uppercase tracking-wide text-gray-700 text-xs font-bold mb-2"} htmlFor="limit_te">
                                TE Limit
                            </label>
                            <input className={inputStyle} id="limit_te" placeholder="TE Limit" onChange={(e) => setLimitTE(parseInt(e.target.value))} value={limitTE}></input>
                        </div>
                        <div className={"w-full md:w-full px-3 mb-6 md:mb-0"}>
                            <label className={"block uppercase tracking-wide text-gray-700 text-xs font-bold mb-2"} htmlFor="limit_def">
                                DEF Limit
                            </label>
                            <input className={inputStyle} id="limit_def" placeholder="DEF Limit" onChange={(e) => setLimitDEF(parseInt(e.target.value))} value={limitDEF}></input>
                        </div>
                    </div>
                </form>
            </div>
        </div>

    );
}