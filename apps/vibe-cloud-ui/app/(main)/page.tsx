import { redirect } from "next/navigation";

export default function Page() {
    // Default landing goes to Profile for now
    redirect("/profile");
}
