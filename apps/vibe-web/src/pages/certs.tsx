"use client";

import { useEffect, useState } from "react";
import { useVibe } from "vibe-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";

export default function CertsPage() {
    const { readOnce, issueCert, revokeCert, isLoggedIn } = useVibe();
    const [myCerts, setMyCerts] = useState<any[]>([]);
    const [issuedCerts, setIssuedCerts] = useState<any[]>([]);
    const [subjectDid, setSubjectDid] = useState("");
    const [certType, setCertType] = useState("");

    const fetchCerts = async () => {
        try {
            const myCertsResult = await readOnce("certs");
            setMyCerts(myCertsResult.docs || []);
            const issuedCertsResult = await readOnce("issued-certs");
            setIssuedCerts(issuedCertsResult.docs || []);
        } catch (e) {
            console.error("Failed to fetch certs", e);
        }
    };

    useEffect(() => {
        if (isLoggedIn) {
            fetchCerts();
        }
    }, [isLoggedIn]);

    const handleIssueCert = async () => {
        try {
            await issueCert(subjectDid, certType);
            setSubjectDid("");
            setCertType("");
            fetchCerts();
        } catch (e) {
            console.error("Failed to issue cert", e);
        }
    };

    const handleRevokeCert = async (certId: string) => {
        try {
            await revokeCert(certId);
            fetchCerts();
        } catch (e) {
            console.error("Failed to revoke cert", e);
        }
    };

    return (
        <div className="container mx-auto p-4">
            <h1 className="text-2xl font-bold mb-4">Certificate Management</h1>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                    <CardHeader>
                        <CardTitle>Issue New Certificate</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <label htmlFor="subjectDid" className="block text-sm font-medium text-gray-700">
                                Subject DID
                            </label>
                            <Input id="subjectDid" value={subjectDid} onChange={(e) => setSubjectDid(e.target.value)} placeholder="did:vibe:..." />
                        </div>
                        <div>
                            <label htmlFor="certType" className="block text-sm font-medium text-gray-700">
                                Certificate Type
                            </label>
                            <Input id="certType" value={certType} onChange={(e) => setCertType(e.target.value)} placeholder="e.g., friend-of" />
                        </div>
                        <Button onClick={handleIssueCert}>Issue Certificate</Button>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>My Certificates</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ul>
                            {myCerts.map((cert) => (
                                <li key={cert._id} className="mb-2">
                                    <strong>Type:</strong> {cert.type}, <strong>Issuer:</strong> {cert.issuer}
                                </li>
                            ))}
                        </ul>
                    </CardContent>
                </Card>

                <Card className="md:col-span-2">
                    <CardHeader>
                        <CardTitle>Issued Certificates</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ul>
                            {issuedCerts.map((cert) => (
                                <li key={cert._id} className="mb-2 flex justify-between items-center">
                                    <span>
                                        <strong>Type:</strong> {cert.type}, <strong>Subject:</strong> {cert.subject}
                                    </span>
                                    <Button variant="destructive" size="sm" onClick={() => handleRevokeCert(cert._id)}>
                                        Revoke
                                    </Button>
                                </li>
                            ))}
                        </ul>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
