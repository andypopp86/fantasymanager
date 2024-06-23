import React from "react";
import { Link } from "react-router-dom";

export default function DraftList({ draft_list }) {
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
                                    <Link to={`/drafts/${draft.id}`}>{draft.draft_name}</Link>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

            </div>

        </div>
    );
}