import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Globe, Users, Shield, UserCheck } from "lucide-react";

const permissionOptions = [
    {
        value: "everyone",
        label: "Everyone",
        description: "Everyone on and outside Vibe",
        icon: <Globe className="w-6 h-6" />,
    },
    {
        value: "admins",
        label: "Admins",
        description: "Only your admins",
        icon: <Shield className="w-6 h-6" />,
    },
    {
        value: "moderators",
        label: "Moderators",
        description: "Only your moderators",
        icon: <UserCheck className="w-6 h-6" />,
    },
    {
        value: "friends",
        label: "Friends",
        description: "Only your friends",
        icon: <Users className="w-6 h-6" />,
    },
    {
        value: "members",
        label: "Members",
        description: "Only your members",
        icon: <Users className="w-6 h-6" />,
    },
    {
        value: "followers",
        label: "Followers",
        description: "Only your followers",
        icon: <Users className="w-6 h-6" />,
    },
];

interface PermissionPickerDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSelect: (permission: string) => void;
}

export function PermissionPickerDialog({ open, onOpenChange, onSelect }: PermissionPickerDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Who can see your post?</DialogTitle>
                    <DialogDescription>Your post will be visible in feeds, on your profile, and in search results.</DialogDescription>
                </DialogHeader>
                <div className="py-4">
                    <RadioGroup defaultValue="everyone" onValueChange={onSelect}>
                        {permissionOptions.map((option) => (
                            <div key={option.value} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted">
                                <div className="flex items-center gap-4">
                                    {option.icon}
                                    <div>
                                        <Label htmlFor={option.value} className="font-bold">
                                            {option.label}
                                        </Label>
                                        <p className="text-sm text-muted-foreground">{option.description}</p>
                                    </div>
                                </div>
                                <RadioGroupItem value={option.value} id={option.value} />
                            </div>
                        ))}
                    </RadioGroup>
                </div>
                <DialogFooter>
                    <Button onClick={() => onOpenChange(false)}>Done</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
