import React from "react";
import { useNavigate } from "react-router-dom";
import DraftCreate from "./DraftCreate";

export default function DraftCreatePage() {
    const navigate = useNavigate();
    return (
        <>
            <button className={"btn"} onClick={() => navigate("/")}>Back</button>
            <DraftCreate />
        </>
    );
}
