import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { draftListRetrieve, logout } from "../lib/data";
import type { CurrentUserOutput } from "../lib/draft.schemas";

import DraftList from "../features/DraftList";

export const DraftDashboard = ({ me }: { me: CurrentUserOutput }) => {
    const navigate = useNavigate();

    const { data: draftListData } = useQuery({
        queryKey: ["draft_list"],
        queryFn: () =>
            draftListRetrieve(),
        select: (data) => {
            return data.data;
        }
    })

    return (
        <>
            <div className="flex justify-end items-center gap-2 text-sm text-gray-600 p-2">
                <span>{me.email}{me.is_staff ? "" : " (spectator)"}</span>
                {me.is_staff && (
                    <a className="btn bg-blue-500 text-white px-2" href="/admin/">
                        Admin
                    </a>
                )}
                <button className="btn bg-gray-400 text-white px-2" onClick={() => logout()}>
                    Log Out
                </button>
            </div>
            {me.is_staff && (
                <button className="flex-1 min-w-full text-center btn bg-green-500 text-white"
                    onClick={() => navigate("/draft/create")}
                >
                    Create Draft
                </button>
            )}
            <DraftList draftList={draftListData} readOnly={!me.is_staff} />
        </>
    );
}
