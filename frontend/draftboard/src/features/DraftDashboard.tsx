import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { draftListRetrieve } from "../lib/data";

import DraftList from "../features/DraftList";

export const DraftDashboard = () => {
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
            <button className="flex-1 min-w-full text-center btn bg-green-500 text-white"
                onClick={() => navigate("/draft/create")}
            >
                Create Draft
            </button>
            <DraftList draftList={draftListData} />
        </>
    );
}
