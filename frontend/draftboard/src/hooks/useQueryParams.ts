import { useLocation, useParams } from "react-router-dom";
import * as qs from "qs";

export const useQueryParams = () => {
    return useParams();
}