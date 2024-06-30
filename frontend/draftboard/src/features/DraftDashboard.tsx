import React, {HTMLProps} from "react";
import { useQuery } from "@tanstack/react-query";
import { draftListRetrieve } from "../lib/data";

import DraftList from "../features/DraftList";

type DraftDashboardProps = {
    draftAppActor: any,
};

export const DraftDashboard = ( { draftAppActor }: DraftDashboardProps) => {
    // const { draft_id } = useQueryParams();
    console.log(draftAppActor)
    console.log(draftAppActor.state)
    const { data: draftListData } = useQuery({
        queryKey: ["draft_list"],
        queryFn: () =>
            draftListRetrieve(),
        select: (data) => {
            console.log(data)
            return data;
        }

    })

  return (
    <>
      <DraftList draft_list={draftListData?.data} draftAppActor={draftAppActor} />
    </>
  )
}