import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { mockDraftsRetrieve, mockDraftCreate, mockDraftDelete } from "../lib/data";

// The mock-draft list — a sketchpad per row. Lives on the dashboard beside the
// draft list; rows link to /mocks/:mockId where the roster gets filled in.
// Creating one here is deliberately one field (a name): a mock draft has no
// managers, rounds or spectators to configure, which is the whole point of it
// existing next to Draft.
export default function MockDraftList() {
    const queryClient = useQueryClient();
    const [name, setName] = useState("");

    const { data: mocks } = useQuery({
        queryKey: ["mock_drafts"],
        queryFn: () => mockDraftsRetrieve(),
        select: (response) => response.data,
    });

    const invalidate = () => queryClient.invalidateQueries({ queryKey: ["mock_drafts"] });

    const create = useMutation({
        mutationFn: () => mockDraftCreate({ name: name.trim() }),
        onSuccess: () => {
            setName("");
            invalidate();
        },
    });

    const remove = useMutation({
        mutationFn: (mockId: number) => mockDraftDelete(mockId),
        onSuccess: invalidate,
    });

    return (
        <div className="container mx-auto">
            <div className="bg-white shadow-md rounded my-6 p-4">
                <div className="flex items-center gap-2 flex-wrap mb-3">
                    <h1 className="text-lg font-bold text-gray-800 mr-auto">Mock Drafts</h1>
                    <input
                        className="border border-gray-300 rounded-md px-2 py-1 text-sm"
                        placeholder="New mock draft name"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter" && name.trim()) create.mutate();
                        }}
                    />
                    <button
                        className="bg-green-500 hover:bg-green-600 text-white text-sm rounded-md px-3 py-1 disabled:opacity-40"
                        disabled={!name.trim() || create.isPending}
                        onClick={() => create.mutate()}
                    >
                        ＋ New mock
                    </button>
                </div>
                <p className="text-xs text-gray-500 mb-3">
                    A roster of slots with no managers — fill it from the player list, then save it as a
                    plan. No empty draft required.
                </p>
                <table className="min-w-full table-auto text-sm">
                    <thead>
                        <tr className="bg-gray-200 text-gray-600 text-xs uppercase tracking-wide">
                            <th className="text-left px-3 py-2">Year</th>
                            <th className="text-left px-3 py-2">Name</th>
                            <th className="text-left px-3 py-2">Slots</th>
                            <th className="text-left px-3 py-2">Budget</th>
                            <th className="px-3 py-2" />
                        </tr>
                    </thead>
                    <tbody>
                        {mocks?.map((mock) => (
                            <tr key={mock.id} className="border-b border-gray-100 hover:bg-gray-50">
                                <td className="px-3 py-2">{mock.year}</td>
                                <td className="px-3 py-2">
                                    <Link className="text-blue-600 hover:underline font-semibold" to={`/mocks/${mock.id}`}>
                                        {mock.name}
                                    </Link>
                                </td>
                                <td className="px-3 py-2 text-gray-600">{mock.filled_slots}/{mock.total_slots}</td>
                                <td className="px-3 py-2 text-gray-600">
                                    ${mock.budget_spent} of ${mock.starting_budget}
                                    <span className={mock.budget_remaining < 0 ? "text-red-600 font-semibold" : "text-gray-400"}>
                                        {" "}({mock.budget_remaining < 0 ? "over by $" + Math.abs(mock.budget_remaining) : "$" + mock.budget_remaining + " left"})
                                    </span>
                                </td>
                                <td className="px-3 py-2 text-right">
                                    <button
                                        className="bg-red-400 hover:bg-red-500 text-white text-xs rounded px-2 py-1"
                                        title="Delete this mock draft"
                                        onClick={() => remove.mutate(mock.id)}
                                    >X</button>
                                </td>
                            </tr>
                        ))}
                        {mocks?.length === 0 && (
                            <tr>
                                <td className="px-3 py-3 text-gray-400" colSpan={5}>No mock drafts yet.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
