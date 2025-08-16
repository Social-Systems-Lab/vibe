import { redirect } from "next/navigation";

export default function Page() {
    // Console-first: default landing goes to /apps
    redirect("/apps");
}
