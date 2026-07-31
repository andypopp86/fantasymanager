import React from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { draftDelete } from "../lib/data";

export default function DraftList({ draftList }) {
    const queryClient = useQueryClient();

    const deleteDraft = (draftId) => {
        draftDelete(draftId).then((response) => {
            if (response.status === 200) {
                queryClient.invalidateQueries({ queryKey: ["draft_list"] });
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
                        {draftList?.map((draft) => (
                            <tr key={draft.id}>
                                <td>{draft.year}</td>
                                <td>
                                    <Link to={`/draft/${draft.id}`}>{draft.draft_name}</Link>
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
