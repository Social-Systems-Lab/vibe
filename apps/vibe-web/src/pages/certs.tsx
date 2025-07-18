"use client";

import { useEffect, useState } from "react";
import { useVibe } from "vibe-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "vibe-react/src/components/ui/textarea";
import { Label } from "vibe-react/src/components/ui/label";
import { CertType, DocRef } from "vibe-sdk";

export default function CertsPage() {
    const { user, isLoggedIn, readOnce, write, remove, issueCert, revokeCert } = useVibe();

    const [myCerts, setMyCerts] = useState<any[]>([]);
    const [issuedCerts, setIssuedCerts] = useState<any[]>([]);
    const [certTypes, setCertTypes] = useState<CertType[]>([]);
    const [selectedCertType, setSelectedCertType] = useState<CertType | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [newCertType, setNewCertType] = useState({
        name: "",
        description: "",
        badgeIconUrl: "",
        bannerImageUrl: "",
    });
    const [subjectDid, setSubjectDid] = useState("");

    const fetchAllData = async () => {
        if (!isLoggedIn || !user) return;
        try {
            const [myCertsResult, issuedCertsResult, certTypesResult] = await Promise.all([
                readOnce("certs", { subject: user.did, expand: ["certType"] }),
                readOnce("issued-certs", { issuer: user.did, expand: ["certType"] }),
                readOnce("cert-types", { owner: user.did }),
            ]);
            setMyCerts(myCertsResult.docs || []);
            setIssuedCerts(issuedCertsResult.docs || []);
            const types = certTypesResult.docs || [];
            setCertTypes(types);

            if (types.length === 0) {
                createDefaultCertTypes();
            }
        } catch (e) {
            console.error("Failed to fetch data", e);
        }
    };

    useEffect(() => {
        fetchAllData();
    }, [isLoggedIn, user]);

    const handleSelectCertType = (certType: CertType) => {
        setSelectedCertType(certType);
        setIsEditing(false);
    };

    const handleCreateOrUpdateCertType = async () => {
        if (!user) return;
        try {
            if (isEditing && selectedCertType) {
                await write("cert-types", { ...selectedCertType, ...newCertType });
            } else {
                await write("cert-types", { ...newCertType, owner: user.did, _id: `cert-types/${newCertType.name}` });
            }
            setNewCertType({ name: "", description: "", badgeIconUrl: "", bannerImageUrl: "" });
            setIsEditing(false);
            setSelectedCertType(null);
            await fetchAllData();
        } catch (e) {
            console.error("Failed to save cert type", e);
        }
    };

    const handleEditCertType = (certType: CertType) => {
        setSelectedCertType(certType);
        setNewCertType({
            name: certType.name,
            description: certType.description,
            badgeIconUrl: certType.badgeIconUrl || "",
            bannerImageUrl: certType.bannerImageUrl || "",
        });
        setIsEditing(true);
    };

    const handleDeleteCertType = async (certTypeId: string) => {
        try {
            await remove("cert-types", { _id: certTypeId });
            setSelectedCertType(null);
            await fetchAllData();
        } catch (e) {
            console.error("Failed to delete cert type", e);
        }
    };

    const handleIssueCert = async () => {
        if (!selectedCertType || !user) return;
        try {
            const docRef: DocRef = {
                did: user.did,
                ref: selectedCertType._id,
            };
            await issueCert(subjectDid, docRef, undefined);
            setSubjectDid("");
            await fetchAllData();
        } catch (e) {
            console.error("Failed to issue cert", e);
        }
    };

    const handleRevokeCert = async (certId: string) => {
        try {
            await revokeCert(certId);
            await fetchAllData();
        } catch (e) {
            console.error("Failed to revoke cert", e);
        }
    };

    const createDefaultCertTypes = async () => {
        if (!user) return;
        const defaultTypes = [
            { name: "admin-of", description: "Administrator access" },
            { name: "moderator-of", description: "Moderator access" },
            { name: "friend-of", description: "A close friend" },
            { name: "member-of", description: "Member of a group or community" },
            { name: "follower-of", description: "Follower of a user or topic" },
            { name: "banned", description: "Banned from a group or community" },
        ];

        try {
            const certTypesToWrite = defaultTypes.map((type) => ({
                ...type,
                owner: user.did,
                _id: `cert-types/${type.name}`,
                badgeIconUrl: "",
                bannerImageUrl: "",
            }));
            await write("cert-types", certTypesToWrite);
            await fetchAllData();
        } catch (e) {
            console.error("Failed to create default cert types", e);
        }
    };

    const renderCertTypeForm = () => (
        <Card>
            <CardHeader>
                <CardTitle>{isEditing ? "Edit" : "Create"} Certificate Type</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div>
                    <Label htmlFor="certName">Name</Label>
                    <Input id="certName" value={newCertType.name} onChange={(e) => setNewCertType({ ...newCertType, name: e.target.value })} placeholder="e.g., friend-of" disabled={isEditing} />
                </div>
                <div>
                    <Label htmlFor="certDescription">Description</Label>
                    <Textarea
                        id="certDescription"
                        value={newCertType.description}
                        onChange={(e) => setNewCertType({ ...newCertType, description: e.target.value })}
                        placeholder="What does this certificate represent?"
                    />
                </div>
                <div>
                    <Label htmlFor="certBadge">Badge Icon URL</Label>
                    <Input
                        id="certBadge"
                        value={newCertType.badgeIconUrl}
                        onChange={(e) => setNewCertType({ ...newCertType, badgeIconUrl: e.target.value })}
                        placeholder="https://example.com/badge.png"
                    />
                </div>
                <div>
                    <Label htmlFor="certBanner">Banner Image URL</Label>
                    <Input
                        id="certBanner"
                        value={newCertType.bannerImageUrl}
                        onChange={(e) => setNewCertType({ ...newCertType, bannerImageUrl: e.target.value })}
                        placeholder="https://example.com/banner.png"
                    />
                </div>
                <div className="flex space-x-2">
                    <Button onClick={handleCreateOrUpdateCertType}>{isEditing ? "Save Changes" : "Create Type"}</Button>
                    <Button
                        variant="outline"
                        onClick={() => {
                            setIsEditing(false);
                            setSelectedCertType(null);
                        }}
                    >
                        Cancel
                    </Button>
                </div>
            </CardContent>
        </Card>
    );

    const renderCertTypeDetails = () => {
        if (!selectedCertType) return null;
        const certsForType = issuedCerts.filter((c) => c.type === selectedCertType._id);

        return (
            <Card className="col-span-1 md:col-span-2">
                <CardHeader>
                    <div className="flex justify-between items-start">
                        <div>
                            <CardTitle className="flex items-center">
                                {selectedCertType.badgeIconUrl && <img src={selectedCertType.badgeIconUrl} alt="badge" className="w-8 h-8 mr-2 rounded-full" />}
                                {selectedCertType.name}
                            </CardTitle>
                            <CardDescription>{selectedCertType.description}</CardDescription>
                        </div>
                        <div className="flex space-x-2">
                            <Button size="sm" onClick={() => handleEditCertType(selectedCertType)}>
                                Edit
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => handleDeleteCertType(selectedCertType._id)}>
                                Delete
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setSelectedCertType(null)}>
                                Close
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {selectedCertType.bannerImageUrl && <img src={selectedCertType.bannerImageUrl} alt="banner" className="w-full h-32 object-cover rounded-md mb-4" />}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <h3 className="font-bold mb-2">Issue to User</h3>
                            <div className="flex space-x-2">
                                <Input value={subjectDid} onChange={(e) => setSubjectDid(e.target.value)} placeholder="did:vibe:..." />
                                <Button onClick={handleIssueCert}>Issue</Button>
                            </div>
                        </div>
                        <div>
                            <h3 className="font-bold mb-2">Issued Certificates ({certsForType.length})</h3>
                            <ul className="space-y-2">
                                {certsForType.map((cert) => (
                                    <li key={cert._id} className="flex justify-between items-center bg-gray-50 p-2 rounded-md">
                                        <span className="truncate">{cert.subject}</span>
                                        <Button variant="destructive" size="sm" onClick={() => handleRevokeCert(cert._id)}>
                                            Revoke
                                        </Button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </CardContent>
            </Card>
        );
    };

    return (
        <div className="container mx-auto p-4 space-y-8">
            <div>
                <h1 className="text-3xl font-bold mb-4">My Certificate Types</h1>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {certTypes.map((ct) => (
                        <Card key={ct._id} className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => handleSelectCertType(ct)}>
                            <CardHeader>
                                <CardTitle className="flex items-center">
                                    {ct.badgeIconUrl && <img src={ct.badgeIconUrl} alt="badge" className="w-6 h-6 mr-2 rounded-full" />}
                                    {ct.name}
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-sm text-gray-600 truncate">{ct.description}</p>
                            </CardContent>
                        </Card>
                    ))}
                    <Card
                        className="flex items-center justify-center border-dashed cursor-pointer hover:border-gray-400"
                        onClick={() => {
                            setSelectedCertType(null);
                            setIsEditing(true);
                        }}
                    >
                        <CardContent className="text-center">
                            <p className="text-lg font-semibold">+ Create New Type</p>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {selectedCertType && !isEditing && renderCertTypeDetails()}
            {isEditing && renderCertTypeForm()}

            <div>
                <h1 className="text-3xl font-bold mb-4">My Received Certificates</h1>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {myCerts.map((cert) => (
                        <Card key={cert._id}>
                            <CardHeader>
                                <CardTitle className="flex items-center">
                                    {cert.certType?.badgeIconUrl && <img src={cert.certType.badgeIconUrl} alt="badge" className="w-6 h-6 mr-2 rounded-full" />}
                                    {cert.certType?.name || cert.type}
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-sm text-gray-600">
                                    <strong>Issuer:</strong> <span className="truncate">{cert.issuer}</span>
                                </p>
                                {cert.certType?.description && <p className="text-sm text-gray-500 mt-2">{cert.certType.description}</p>}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>
        </div>
    );
}
