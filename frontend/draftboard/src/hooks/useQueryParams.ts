import { useLocation, useParams } from "react-router-dom";
import * as qs from "qs";

export const useQueryParams = () => {
    return useParams();
    // const location = useLocation();
    // console.log(location)
    // const params = useParams();
    // console.log(params)
    // return qs.parse(location.search, { ignoreQueryPrefix: true })
}