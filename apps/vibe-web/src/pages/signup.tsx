import { signup } from "../actions";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

export default function SignupPage() {
    return (
        <div className="flex justify-center items-center h-screen">
            <Card className="w-[350px]">
                <CardHeader>
                    <CardTitle>Sign Up</CardTitle>
                    <CardDescription>Create your account to continue.</CardDescription>
                </CardHeader>
                <form action={signup}>
                    <CardContent>
                        <div className="grid w-full items-center gap-4">
                            <div className="flex flex-col space-y-1.5">
                                <Label htmlFor="email">Email</Label>
                                <Input id="email" name="email" placeholder="Enter your email" />
                            </div>
                            <div className="flex flex-col space-y-1.5">
                                <Label htmlFor="password">Password</Label>
                                <Input id="password" name="password" type="password" placeholder="Enter your password" />
                            </div>
                        </div>
                    </CardContent>
                    <CardFooter>
                        <Button type="submit" className="w-full">
                            Sign Up
                        </Button>
                    </CardFooter>
                </form>
            </Card>
        </div>
    );
}
