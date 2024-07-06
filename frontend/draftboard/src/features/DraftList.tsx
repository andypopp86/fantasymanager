import React from "react";

export default function DraftList({ draft_list, send }) {
    const sendDraftSelected = (draft) => {
        send({ type: "draft.selected", draft: draft })
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
                            </tr>
                        ))}
                    </tbody>
                </table>

            </div>

        </div>
    );
}