import React, {useState} from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { draftCreate } from "../lib/data";

// The allocation plan. RB/WR/QB-TE-DEF PARTITION the roster by position and are
// what sums to the budget; only RB and WR carry a body COUNT, being the
// positions you buy several of. The bench line is a CARVE-OUT inside those
// dollars — a bench RB is RB money and bench money — so it is priced separately
// below rather than added to the total.
const PLAN_FIELDS = [
    { field: "target_rb", label: "RB $", count: "target_rb_count" },
    { field: "target_wr", label: "WR $", count: "target_wr_count" },
    { field: "target_other", label: "QB/TE/DEF $", count: null },
] as const;

export default function DraftCreate() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
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
    const [availableToSpectators, setAvailableToSpectators] = useState(false);
    // The opening allocation plan — the intent /draft/:id/allocation measures the
    // real draft against. Editable there too, because a position re-prices itself
    // the moment you buy into it. Defaults spend the default $200.
    const [targets, setTargets] = useState<Record<string, number>>({
        target_rb: 88, target_rb_count: 4,
        target_wr: 76, target_wr_count: 4,
        target_other: 36,
        target_bench: 18,
    });
    const targetTotal = PLAN_FIELDS.reduce((sum, row) => sum + (targets[row.field] || 0), 0);
    const targetRemainder = (startingBudget || 0) - targetTotal;

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
            available_to_spectators: availableToSpectators,
            target_rb: targets.target_rb || 0,
            target_rb_count: targets.target_rb_count || 0,
            target_wr: targets.target_wr || 0,
            target_wr_count: targets.target_wr_count || 0,
            target_other: targets.target_other || 0,
            target_bench: targets.target_bench || 0,
        }
        draftCreate({ ...draftData }).then(() => {
            queryClient.invalidateQueries({ queryKey: ["draft_list"] });
            navigate("/");
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
                            <label className={"block uppercase tracking-wide text-gray-700 text-xs font-bold mb-2"} htmlFor="available_to_spectators">
                                Visible to Spectators
                            </label>
                            <input id="available_to_spectators" type="checkbox" className={"h-5 w-5"}
                                onChange={(e) => setAvailableToSpectators(e.target.checked)} checked={availableToSpectators}></input>
                        </div>
                    </div>
                    <div className={"flex flex-wrap -mx-3 mb-6"}>
                        <div className={"w-full px-3"}>
                            <label className={"block uppercase tracking-wide text-gray-700 text-xs font-bold mb-2"}>
                                Allocation plan
                            </label>
                            <p className={"text-xs text-gray-500 mb-2"}>
                                What you MEAN to spend, and how many bodies at RB/WR. The Allocation
                                page measures the live draft against this — and lets you re-plan there.
                            </p>
                            {PLAN_FIELDS.map((row) => (
                                <div key={row.field} className={"flex items-center gap-2 mb-2"}>
                                    <span className={"w-24 text-sm font-bold text-gray-700"}>{row.label}</span>
                                    <input
                                        className={"appearance-none block w-24 bg-gray-200 text-gray-700 border rounded py-2 px-3 leading-tight focus:outline-none focus:bg-white"}
                                        id={row.field}
                                        type="number"
                                        min={0}
                                        value={targets[row.field]}
                                        onChange={(e) => setTargets({
                                            ...targets,
                                            [row.field]: parseInt(e.target.value) || 0,
                                        })}
                                    />
                                    {row.count && (
                                        <>
                                            <span className={"text-sm text-gray-500"}>over</span>
                                            <input
                                                className={"appearance-none block w-16 bg-gray-200 text-gray-700 border rounded py-2 px-3 leading-tight focus:outline-none focus:bg-white"}
                                                id={row.count}
                                                type="number"
                                                min={0}
                                                value={targets[row.count]}
                                                onChange={(e) => setTargets({
                                                    ...targets,
                                                    [row.count as string]: parseInt(e.target.value) || 0,
                                                })}
                                            />
                                            <span className={"text-sm text-gray-500"}>players</span>
                                        </>
                                    )}
                                </div>
                            ))}
                            {/* The sum is shown, not enforced: leaving money loose (or
                                knowingly planning over) is a legitimate plan. */}
                            <p className={`text-sm font-semibold ${targetRemainder === 0 ? "text-gray-600" : targetRemainder > 0 ? "text-blue-700" : "text-red-700"}`}>
                                ${targetTotal} of ${startingBudget || 0} allocated
                                {targetRemainder > 0 && ` — $${targetRemainder} unallocated`}
                                {targetRemainder < 0 && ` — $${Math.abs(targetRemainder)} over budget`}
                            </p>
                            <div className={"flex items-center gap-2 mt-3 pt-3 border-t"}>
                                <span className={"w-24 text-sm font-bold text-gray-700"}>Bench $</span>
                                <input
                                    className={"appearance-none block w-24 bg-gray-200 text-gray-700 border rounded py-2 px-3 leading-tight focus:outline-none focus:bg-white"}
                                    id="target_bench"
                                    type="number"
                                    min={0}
                                    value={targets.target_bench}
                                    onChange={(e) => setTargets({
                                        ...targets,
                                        target_bench: parseInt(e.target.value) || 0,
                                    })}
                                />
                                <span className={"text-xs text-gray-500"}>
                                    of the above, held back for the 7 bench slots
                                </span>
                            </div>
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