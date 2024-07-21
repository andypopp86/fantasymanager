import React from "react";
import { draftDelete } from "../lib/data";

export default function DraftList({ draft_list, send }) {
    const sendDraftSelected = (draft) => {
        send({ type: "draft.selected", draft: draft })
    }
    const deleteDraft = (draftId) => {
        draftDelete(draftId).then((response) => {
            console.log(response);
            if (response.status === 200) {
                send({ type: "draft.deleted", draftId: draftId })
            }
        })
    }

    return (
        <div className={"container mx-auto"}>
            <div className={"bg-white shadow-md rounded my-6"}>
                <h1>Draft List</h1>
                <table className={"min-w-full table-auto"}>
                    <thead>
                        <tr className="bg-gray-200 text-gray-600 text-sm leading-normal">
                            <th>Year</th>
                            <th>Draft Name</th>
                        </tr>
                    </thead>
                    <tbody>
                        {draft_list?.map((draft) => (
                            <tr key={draft.id}>
                                <td>{draft.year}</td>
                                <td>
                                    <button onClick={() => sendDraftSelected(draft)}>{draft.draft_name}</button>
                                </td>
                                <td>
                                    {
                                    draft.locked ?
                                        <span>Locked</span>
                                        :
                                        <button className="bg-red-400 text-white" onClick={() => deleteDraft(draft.id)}>X</button>
                                    }
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

            </div>

        </div>
    );
}